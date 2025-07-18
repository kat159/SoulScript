import { Box, HStack, Text, Badge, Button, IconButton } from "@chakra-ui/react"
import { FaList, FaUpload, FaPause, FaPlay, FaTimes } from "react-icons/fa"
import { useUploadStore } from "../../store/useUploadStore"
import { useState, useEffect } from "react"
import UploadQueue from "./UploadQueue"

const UploadStatusIndicator = () => {
  const [showQueue, setShowQueue] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const { 
    files, 
    isUploading, 
    currentUploadingId,
    startUpload,
    pauseUpload
  } = useUploadStore()

  // Show indicator when new files are added, even if previously hidden
  useEffect(() => {
    if (files.length > 0 && isHidden) {
      setIsHidden(false)
    }
  }, [files.length])

  // Hide when no files
  if (files.length === 0 || isHidden) {
    return null
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const uploadingCount = files.filter(f => f.status === 'uploading').length
  const successCount = files.filter(f => f.status === 'success').length
  const errorCount = files.filter(f => f.status === 'error').length

  const currentFile = files.find(f => f.id === currentUploadingId)

  const handleHide = () => {
    setIsHidden(true)
    setShowQueue(false)
  }

  return (
    <>
      <Box
        position="fixed"
        bottom={4}
        right={4}
        bg="white"
        borderRadius="md"
        shadow="lg"
        border="1px solid"
        borderColor="gray.200"
        p={3}
        minW="320px"
        maxW="400px"
        zIndex={1000}
        _dark={{ bg: "gray.800", borderColor: "gray.600" }}
      >
        <HStack justify="space-between" align="center" mb={2}>
          <HStack>
            <FaUpload color={isUploading ? "blue" : "gray"} />
            <Text fontSize="sm" fontWeight="medium">
              Upload Queue
            </Text>
          </HStack>
          
          <HStack gap={1}>
            {!isUploading && pendingCount > 0 && (
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="blue"
                aria-label="Start upload"
                onClick={startUpload}
                title="Start upload"
              >
                <FaPlay />
              </IconButton>
            )}
            
            {isUploading && (
              <IconButton
                size="xs"
                variant="ghost"
                colorPalette="orange"
                aria-label="Pause upload"
                onClick={pauseUpload}
                title="Pause upload"
              >
                <FaPause />
              </IconButton>
            )}
            
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Show queue"
              onClick={() => setShowQueue(!showQueue)}
              title="Show upload queue"
            >
              <FaList />
            </IconButton>

            <IconButton
              size="xs"
              variant="ghost"
              colorPalette="gray"
              aria-label="Hide indicator"
              onClick={handleHide}
              title="Hide upload indicator"
            >
              <FaTimes />
            </IconButton>
          </HStack>
        </HStack>

        <HStack gap={2} mb={2} wrap="wrap">
          {pendingCount > 0 && (
            <Badge colorPalette="gray" size="sm">{pendingCount} pending</Badge>
          )}
          {uploadingCount > 0 && (
            <Badge colorPalette="blue" size="sm">{uploadingCount} uploading</Badge>
          )}
          {successCount > 0 && (
            <Badge colorPalette="green" size="sm">{successCount} success</Badge>
          )}
          {errorCount > 0 && (
            <Badge colorPalette="red" size="sm">{errorCount} errors</Badge>
          )}
        </HStack>

        {currentFile && (
          <Box>
            <Text fontSize="xs" color="gray.600" truncate title={currentFile.title}>
              Uploading: {currentFile.title}
            </Text>
            <HStack justify="space-between" align="center">
              <Text fontSize="xs" color="gray.500">
                {currentFile.progress}% complete
              </Text>
              <Box 
                w="60px" 
                h="2" 
                bg="gray.200" 
                borderRadius="sm"
                overflow="hidden"
              >
                <Box 
                  h="full" 
                  bg="blue.500" 
                  borderRadius="sm"
                  style={{ width: `${currentFile.progress}%` }}
                  transition="width 0.3s ease"
                />
              </Box>
            </HStack>
          </Box>
        )}

        {!currentFile && files.length > 0 && (
          <Text fontSize="xs" color="gray.500">
            {files.length} file{files.length > 1 ? 's' : ''} in queue
          </Text>
        )}
      </Box>

      {showQueue && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="rgba(0, 0, 0, 0.5)"
          zIndex={999}
          onClick={() => setShowQueue(false)}
        >
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="white"
            borderRadius="lg"
            shadow="xl"
            maxW="800px"
            maxH="80vh"
            overflow="auto"
            onClick={(e) => e.stopPropagation()}
            _dark={{ bg: "gray.800" }}
          >
            <UploadQueue />
            <Box p={4} borderTop="1px solid" borderColor="gray.200">
              <Button
                size="sm"
                onClick={() => setShowQueue(false)}
                w="full"
              >
                Close Queue
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </>
  )
}

export default UploadStatusIndicator
