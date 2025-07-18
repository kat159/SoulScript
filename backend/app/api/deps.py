from collections.abc import Generator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User
from app.util.redis_client import try_acquire_slots, RedisSlot

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


def check_upload_concurrency(route_concurrent: int):
    """
    Create a dependency that checks upload concurrency limits.
    
    Args:
        route_concurrent: Maximum concurrent uploads for this specific route
        
    Returns:
        FastAPI dependency function that manages Redis slots
    """
    def dependency(request: Request, current_user: CurrentUser) -> Generator[RedisSlot, None, None]:
        route_limit_key = f"doc_upload_slots:{request.scope['route'].path}:{current_user.id}"
        global_limit_key = f"doc_upload_slots:global:{current_user.id}"

        try:
            slot = try_acquire_slots([
                (route_limit_key, route_concurrent, 60),
                (global_limit_key, settings.USER_GLOBAL_UPLOAD_MAX_CONCURRENT, 60)
            ])
            
            if not slot:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error": "Too many concurrent uploads",
                        "code": "concurrency_limit",
                        "can_force": False,
                        "add_to_queue": True
                    }
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Redis error when acquiring slot: {e}")

        try:
            yield slot
        finally:
            slot.release()

    return dependency
