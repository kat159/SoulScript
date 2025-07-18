import {Box, Center, Icon, Spinner, Text, VStack,} from "@chakra-ui/react"
import {useRef} from "react"
import {FiUploadCloud} from "react-icons/fi"

export default function UploadBox(
  {
    onUpload,
    maxSize_Bytes,
    fileTypes,
    isUploading,
  }: {
    onUpload: (files: File[]) => Promise<void> | void,
    maxSize_Bytes?: number,
    fileTypes?: string[],
    isUploading?: boolean,
  }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    onUpload(Array.from(files))
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    handleFileSelect(e.dataTransfer.files)
  }

  return (
    <VStack align="stretch" w="100%">
      <Box
        minH="160px"
        border="2px dashed"
        borderColor="gray.300"
        borderRadius="md"
        p={8}
        textAlign="center"
        cursor={isUploading ? "not-allowed" : "pointer"}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        bg={isUploading ? "gray.100" : "gray.50"}
        _hover={!isUploading ? {bg: "gray.100"} : undefined}
        transition="background-color 0.2s"
        pointerEvents={isUploading ? "none" : "auto"}
      >
        {isUploading ? (
          <Center flexDirection="column" gap={2} h="100%">
            <Spinner size="lg" color="blue.500"/>
            <Text color="gray.600">Uploading...</Text>
          </Center>
        ) : (
          <Center flexDirection="column" gap={2} h="100%">
            <Icon as={FiUploadCloud} boxSize={8} color="gray.500"/>
            <Text color="gray.600">Click or drag a file here to upload</Text>
            <Text fontSize="sm" color="gray.400">
              Supported: {fileTypes?.join(", ")}
            </Text>
            <Text fontSize="sm" color="gray.400">
              Max size: {maxSize_Bytes ? (maxSize_Bytes / 1024 / 1024).toFixed(2) : 0} MB
            </Text>
          </Center>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={`${fileTypes?.join(",")}`}
          hidden
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </Box>
    </VStack>
  )
}
