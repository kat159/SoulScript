import {
  Box,
  Button,
  HStack,
  VStack,
  Text,
  IconButton,
  Badge,
  Container,
} from "@chakra-ui/react"
import { FaPlay, FaPause, FaTrash, FaRedo, FaTrashAlt, FaCheck, FaTimes } from "react-icons/fa"
import { useUploadStore } from "../../store/useUploadStore"
import type { UploadFile } from "../../store/useUploadStore"

const UploadQueueItem = ({ file }: { file: UploadFile }) => {
  const { removeFile, retryFile } = useUploadStore()

  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return 'gray'
      case 'uploading': return 'blue'
      case 'success': return 'green'
      case 'error': return 'red'
      default: return 'gray'
    }
  }

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending': return <Box w={4} h={4} bg="gray.400" borderRadius="full" />
      case 'uploading': return <Box w={4} h={4} bg="blue.500" borderRadius="full" className="animate-pulse" />
      case 'success': return <FaCheck color="green" />
      case 'error': return <FaTimes color="red" />
      default: return null
    }
  }

  return (
    <Box
      p={3}
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      bg="white"
      _dark={{ bg: "gray.800", borderColor: "gray.600" }}
    >
      <HStack justify="space-between" align="start">
        <VStack align="start" flex={1} gap={1}>
          <HStack>
            {getStatusIcon(file.status)}
            <Text fontSize="sm" fontWeight="medium" truncate maxW="300px">
              {file.title}
            </Text>
            <Badge colorPalette={getStatusColor(file.status)} size="sm">
              {file.status}
            </Badge>
          </HStack>
          
          {file.description && (
            <Text fontSize="xs" color="gray.600" lineClamp={2}>
              {file.description}
            </Text>
          )}
          
          <Text fontSize="xs" color="gray.500">
            {file.file?.name} ({((file.file?.size || 0) / 1024 / 1024).toFixed(2)} MB)
          </Text>

          {file.status === 'uploading' && (
            <Box w="full">
              <Box 
                w="full" 
                h="2" 
                bg="gray.200" 
                borderRadius="sm"
                overflow="hidden"
              >
                <Box 
                  h="full" 
                  bg="blue.500" 
                  borderRadius="sm"
                  style={{ width: `${file.progress}%` }}
                  transition="width 0.3s ease"
                />
              </Box>
              <Text fontSize="xs" color="gray.500" mt={1}>
                {file.progress}%
              </Text>
            </Box>
          )}

          {file.error && (
            <Text fontSize="xs" color="red.500" mt={1}>
              {file.error}
            </Text>
          )}
        </VStack>

        <VStack gap={1}>
          {file.status === 'error' && (
            <IconButton
              size="sm"
              variant="ghost"
              colorPalette="blue"
              aria-label="Retry upload"
              onClick={() => retryFile(file.id)}
              title="Retry upload"
            >
              <FaRedo />
            </IconButton>
          )}
          
          {file.status !== 'uploading' && (
            <IconButton
              size="sm"
              variant="ghost"
              colorPalette="red"
              aria-label="Remove file"
              onClick={() => removeFile(file.id)}
              title="Remove from queue"
            >
              <FaTrash />
            </IconButton>
          )}
        </VStack>
      </HStack>
    </Box>
  )
}

const UploadQueue = () => {
  const { 
    files, 
    isUploading, 
    startUpload, 
    pauseUpload, 
    clearCompleted, 
    clearAll 
  } = useUploadStore()

  if (files.length === 0) {
    return null
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const uploadingCount = files.filter(f => f.status === 'uploading').length
  const successCount = files.filter(f => f.status === 'success').length
  const errorCount = files.filter(f => f.status === 'error').length

  return (
    <Container maxW="container.lg" py={4}>
      <VStack align="stretch" gap={4}>
        <Box p={4} bg="gray.50" borderRadius="md" _dark={{ bg: "gray.700" }}>
          <HStack justify="space-between" align="center" mb={3}>
            <Text fontSize="lg" fontWeight="bold">
              Upload Queue ({files.length} files)
            </Text>
            <HStack gap={2}>
              <Badge colorPalette="gray">{pendingCount} pending</Badge>
              <Badge colorPalette="blue">{uploadingCount} uploading</Badge>
              <Badge colorPalette="green">{successCount} success</Badge>
              <Badge colorPalette="red">{errorCount} errors</Badge>
            </HStack>
          </HStack>

          <HStack gap={2}>
            {!isUploading && pendingCount > 0 && (
              <Button
                size="sm"
                colorPalette="blue"
                onClick={startUpload}
              >
                <FaPlay style={{ marginRight: '8px' }} />
                Start Upload
              </Button>
            )}
            
            {isUploading && (
              <Button
                size="sm"
                colorPalette="orange"
                onClick={pauseUpload}
              >
                <FaPause style={{ marginRight: '8px' }} />
                Pause Upload
              </Button>
            )}

            {successCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearCompleted}
              >
                <FaCheck style={{ marginRight: '8px' }} />
                Clear Completed
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              onClick={clearAll}
            >
              <FaTrashAlt style={{ marginRight: '8px' }} />
              Clear All
            </Button>
          </HStack>
        </Box>

        <VStack align="stretch" gap={2}>
          {files.map((file) => (
            <UploadQueueItem key={file.id} file={file} />
          ))}
        </VStack>
      </VStack>
    </Container>
  )
}

export default UploadQueue
