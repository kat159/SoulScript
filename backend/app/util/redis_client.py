import time
import threading
from typing import List, Tuple, Optional, Dict, Any
from fastapi import HTTPException


class MockRedisClient:
    """
    Mock Redis client that simulates Redis operations using in-memory storage.
    Thread-safe implementation for concurrent operations.
    """
    
    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._expiry: Dict[str, float] = {}
        self._lock = threading.RLock()
    
    def _cleanup_expired(self):
        """Remove expired keys"""
        current_time = time.time()
        expired_keys = [
            key for key, expiry_time in self._expiry.items() 
            if expiry_time <= current_time
        ]
        for key in expired_keys:
            self._data.pop(key, None)
            self._expiry.pop(key, None)
    
    def incr(self, key: str) -> int:
        """Increment the value of a key by 1"""
        with self._lock:
            self._cleanup_expired()
            current_value = self._data.get(key, 0)
            new_value = int(current_value) + 1
            self._data[key] = new_value
            return new_value
    
    def decr(self, key: str) -> int:
        """Decrement the value of a key by 1"""
        with self._lock:
            self._cleanup_expired()
            current_value = self._data.get(key, 0)
            new_value = max(int(current_value) - 1, 0)  # Don't go below 0
            self._data[key] = new_value
            return new_value
    
    def expire(self, key: str, seconds: int) -> bool:
        """Set expiry time for a key"""
        with self._lock:
            if key in self._data:
                self._expiry[key] = time.time() + seconds
                return True
            return False
    
    def get(self, key: str) -> Optional[str]:
        """Get the value of a key"""
        with self._lock:
            self._cleanup_expired()
            return self._data.get(key)
    
    def mget(self, keys: List[str]) -> List[Optional[str]]:
        """Get multiple keys at once"""
        with self._lock:
            self._cleanup_expired()
            return [self._data.get(key) for key in keys]
    
    def ping(self) -> bool:
        """Test connection (always returns True for mock)"""
        return True
    
    def pipeline(self):
        """Return a pipeline context manager"""
        return MockRedisPipeline(self)


class MockRedisPipeline:
    """
    Mock Redis pipeline that batches operations and executes them atomically.
    """
    
    def __init__(self, client: MockRedisClient):
        self._client = client
        self._operations: List[Tuple[str, str, Tuple]] = []  # (method, key, args)
    
    def incr(self, key: str):
        """Queue an increment operation"""
        self._operations.append(('incr', key, ()))
        return self
    
    def decr(self, key: str):
        """Queue a decrement operation"""
        self._operations.append(('decr', key, ()))
        return self
    
    def expire(self, key: str, seconds: int):
        """Queue an expire operation"""
        self._operations.append(('expire', key, (seconds,)))
        return self
    
    def execute(self) -> List[Any]:
        """Execute all queued operations atomically"""
        with self._client._lock:
            results = []
            for method, key, args in self._operations:
                if method == 'incr':
                    result = self._client.incr(key)
                elif method == 'decr':
                    result = self._client.decr(key)
                elif method == 'expire':
                    result = self._client.expire(key, *args)
                else:
                    result = None
                results.append(result)
            self._operations.clear()
            return results
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            return self.execute()


# Global mock Redis instances
rdb = MockRedisClient()
ardb = MockRedisClient()  # Async version (same as sync for mock)


class RedisSlot:
    """
    Redis-based concurrency slot manager that tracks multiple concurrent limits.
    
    This class handles acquiring and releasing slots for rate limiting based on
    multiple concurrent limits (e.g., per-route and global limits).
    """
    
    def __init__(self, limits: List[Tuple[str, int, int]]):
        """
        Initialize the Redis slot manager.
        
        Args:
            limits: List of tuples containing (key, max_concurrent, ttl)
                   - key: Redis key for the limit
                   - max_concurrent: Maximum concurrent operations allowed
                   - ttl: Time to live for the key in seconds
        """
        self.limits = limits
        self.keys = [key for key, _, _ in limits]

    def acquire(self) -> Optional["RedisSlot"]:
        """
        Try to acquire slots for all limits.
        
        Returns:
            Self if successful, None if any limit would be exceeded
            
        Raises:
            HTTPException: If Redis operations fail
        """
        try:
            # Increment all counters atomically
            with rdb.pipeline() as pipe:
                for key, _, _ in self.limits:
                    pipe.incr(key)
                results = pipe.execute()

            over_limit = False
            keys_to_expire: List[Tuple[str, int]] = []

            # Check if any limit is exceeded
            for i, (key, max_allowed, ttl) in enumerate(self.limits):
                current = results[i]
                if current > max_allowed:
                    over_limit = True
                elif current == 1:
                    # This is the first increment, set TTL
                    keys_to_expire.append((key, ttl))

            if over_limit:
                # Rollback all increments
                with rdb.pipeline() as pipe:
                    for key, _, _ in self.limits:
                        pipe.decr(key)
                    pipe.execute()
                return None

            # Set TTL for new keys
            if keys_to_expire:
                with rdb.pipeline() as pipe:
                    for key, ttl in keys_to_expire:
                        pipe.expire(key, ttl)
                    pipe.execute()

            return self
        except Exception as e:
            raise HTTPException(500, f"Failed to acquire redis slot: {e}")

    def release(self):
        """
        Release all acquired slots by decrementing counters.
        """
        try:
            with rdb.pipeline() as pipe:
                for key in self.keys:
                    pipe.decr(key)
                pipe.execute()
        except Exception as e:
            # Log the error but don't raise - we don't want to break the response
            # just because we couldn't release the slot
            print(f"Warning: Failed to release redis slot: {e}")

    @property
    def empty_slots(self) -> int:
        """
        Get the number of available slots (minimum across all limits).
        
        Returns:
            Number of available slots
            
        Raises:
            HTTPException: If Redis operations fail
        """
        try:
            current_values = rdb.mget(self.keys)
            min_available = float("inf")
            
            for (key, max_allowed, _), current in zip(self.limits, current_values):
                current_int = int(current or 0)
                available = max(max_allowed - current_int, 0)
                min_available = min(min_available, available)
                
            return min_available if min_available != float("inf") else 0
        except Exception as e:
            raise HTTPException(500, f"Failed to get empty_slots: {e}")


def try_acquire_slots(limit_keys: List[Tuple[str, int, int]]) -> Optional[RedisSlot]:
    """
    Try to acquire slots for multiple concurrent limits.
    
    Args:
        limit_keys: List of tuples containing (key, max_concurrent, ttl)
        
    Returns:
        RedisSlot if successful, None if any limit would be exceeded
    """
    slot = RedisSlot(limit_keys)
    return slot.acquire()


def check_redis_connection() -> bool:
    """
    Check if Redis connection is available.
    
    Returns:
        True if Redis is available, False otherwise
    """
    try:
        rdb.ping()
        return True
    except Exception:
        return False
