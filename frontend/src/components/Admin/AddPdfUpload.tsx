import { useQueryClient } from "@tanstack/react-query"

import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Text,
} from "@chakra-ui/react"
import { useState } from "react"
import { FaUpload } from "react-icons/fa"
import {
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTrigger,
} from "../ui/dialog"
import UploadBox from "../Common/UploadBox"
import { useUploadStore } from "../../store/useUploadStore"

const AddPdfUpload = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { addFiles } = useUploadStore()
  const queryClient = useQueryClient()

  const handleFilesUpload = (files: File[]) => {
    if (files.length > 0) {
      // All files are added to the queue, including invalid files
      files.forEach(file => {
        const title = file.name.replace(/\.(pdf|PDF)$/, '') || file.name // Remove .pdf extension if present, otherwise use full filename
        
        // Check if the file is valid
        const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB in bytes
        let errorMessage = ''
        
        if (file.size > MAX_FILE_SIZE) {
          errorMessage = `File size (${(file.size / (1024*1024)).toFixed(2)} MB) exceeds the maximum allowed size of 10 MB`
        } else if (file.type !== 'application/pdf') {
          errorMessage = `File type "${file.type || 'unknown'}" is not supported. Only PDF files are allowed`
        } else if (file.size === 0) {
          errorMessage = 'File appears to be empty'
        }
        // Note: PDF integrity validation is now handled entirely by the server
        // to avoid duplicate error messages
        
        if (errorMessage) {
          // Create a file entry with error status
          addFiles([file], title, undefined, errorMessage)
        } else {
          // Valid files are added normally, server will perform integrity check
          addFiles([file], title)
        }
      })
      
      // Close dialog
      setIsOpen(false)
      
      // Refresh PDFs query
      queryClient.invalidateQueries({ queryKey: ["pdfs"] })
    }
  }

  return (
    <DialogRoot
      size={{ base: "xs", md: "md" }}
      placement="center"
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button value="add-pdf" my={4}>
          <FaUpload fontSize="16px" />
          Upload PDFs
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload PDF Documents</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Text mb={4}>
            Drag and drop PDF files to upload them to the spiritual chatbot. Files will be validated for integrity and corruption before processing. All files will be added to the upload queue, including invalid files with error status.
          </Text>
          <UploadBox
            onUpload={handleFilesUpload}
            maxSize_Bytes={10 * 1024 * 1024} // 10MB
            fileTypes={['.pdf']}
            isUploading={false}
          />
          <Text fontSize="sm" color="gray.600" mt={3}>
            • Maximum file size: 10 MB per file
            • Only PDF files are supported
            • Files are checked for corruption and integrity
            • Files will use their filename as the title
            • Invalid or corrupted files will show error status in the upload queue
            • All upload progress and errors are shown in the global queue
          </Text>
        </DialogBody>
        <DialogFooter gap={2}>
          <DialogActionTrigger asChild>
            <Button
              variant="subtle"
              colorPalette="gray"
            >
              Close
            </Button>
          </DialogActionTrigger>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}

export default AddPdfUpload 