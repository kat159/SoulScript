import React, { useState } from "react"
import {
  Box,
  Button,
  HStack,
  Input,
  IconButton,
  VStack,
  useBreakpointValue,
} from "@chakra-ui/react"
import { FaEdit, FaCheck, FaTimes } from "react-icons/fa"
import useCustomToast from "@/hooks/useCustomToast"
import { OpenAPI } from '@/client/core/OpenAPI'
import { request } from '@/client/core/request'

interface PDFDocument {
  id: string
  title: string
  description?: string
  filename: string
  file_size: number
  page_count: number
  is_processed: boolean
  processing_status: string
  created_at: string
  updated_at: string
}

interface InlineEditPdfProps {
  pdf: PDFDocument
  onUpdate: (updatedPdf: PDFDocument) => void
}

interface PDFUpdateData {
  title?: string
  description?: string
}

class PDFUpdateService {
  static async updatePDF(pdfId: string, data: PDFUpdateData): Promise<PDFDocument> {
    const token = localStorage.getItem("access_token")
    if (!token) {
      throw new Error("No authentication token found")
    }

    // Temporarily set the token in OpenAPI config
    const originalToken = OpenAPI.TOKEN
    OpenAPI.TOKEN = token

    try {
      const response = await request(OpenAPI, {
        method: "PUT",
        url: `/api/v1/pdfs/${pdfId}`,
        body: data,
      })

      return response as PDFDocument
    } finally {
      // Restore original token
      OpenAPI.TOKEN = originalToken
    }
  }
}

const InlineEditPdf: React.FC<InlineEditPdfProps> = ({ pdf, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(pdf.title)
  const [editDescription, setEditDescription] = useState(pdf.description || "")
  const [isUpdating, setIsUpdating] = useState(false)
  const { showSuccessToast, showErrorToast } = useCustomToast()

  // 响应式设置
  const isMobile = useBreakpointValue({ base: true, md: false })
  const textareaMinRows = isMobile ? 2 : 3
  const textareaMaxRows = isMobile ? 8 : 15

  const handleEdit = () => {
    setEditTitle(pdf.title)
    setEditDescription(pdf.description || "")
    setIsEditing(true)
  }

  const handleCancel = () => {
    setEditTitle(pdf.title)
    setEditDescription(pdf.description || "")
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!editTitle.trim()) {
      showErrorToast("Title cannot be empty")
      return
    }

    if (editTitle.length > 255) {
      showErrorToast("Title must be 255 characters or less")
      return
    }

    if (editDescription.length > 500) {
      showErrorToast("Description must be 500 characters or less")
      return
    }

    setIsUpdating(true)

    try {
      const updateData: PDFUpdateData = {}
      
      // 只发送有变化的字段
      if (editTitle.trim() !== pdf.title) {
        updateData.title = editTitle.trim()
      }
      
      if (editDescription.trim() !== (pdf.description || "")) {
        updateData.description = editDescription.trim() || undefined
      }

      // 如果没有变化，直接退出编辑模式
      if (Object.keys(updateData).length === 0) {
        setIsEditing(false)
        return
      }

      const updatedPdf = await PDFUpdateService.updatePDF(pdf.id, updateData)
      
      onUpdate(updatedPdf)
      setIsEditing(false)
      showSuccessToast("PDF updated successfully")
      
    } catch (error) {
      console.error("Error updating PDF:", error)
      showErrorToast(`Failed to update PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditDescription(e.target.value)
    
    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    const scrollHeight = textarea.scrollHeight
    const lineHeight = 24 // 1.5em in pixels
    const minHeight = textareaMinRows * lineHeight
    const maxHeight = textareaMaxRows * lineHeight
    
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight)
    textarea.style.height = `${newHeight}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleCancel()
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  if (!isEditing) {
    return (
      <HStack justify="space-between" align="start" w="full">
        <VStack align="start" gap={1} flex={1}>
          <Box fontSize="md" fontWeight="semibold" color="gray.900" lineHeight="short">
            {pdf.title}
          </Box>
          {pdf.description && (
            <Box 
              fontSize="sm" 
              color="gray.600" 
              lineHeight="normal"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
            >
              {pdf.description}
            </Box>
          )}
        </VStack>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="Edit PDF"
          onClick={handleEdit}
          flexShrink={0}
          ml={2}
        >
          <FaEdit />
        </IconButton>
      </HStack>
    )
  }

  return (
    <VStack gap={3} w="full" align="stretch" onKeyDown={handleKeyDown}>
      <Input
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        placeholder="PDF Title"
        size="sm"
        maxLength={255}
        disabled={isUpdating}
        autoFocus
        variant="outline"
        _focus={{ borderColor: "blue.500", boxShadow: "0 0 0 1px blue.500" }}
      />
      
      {/* Title character count */}
      <Box fontSize="xs" color="gray.400" textAlign="right" mt={-2} mb={1}>
        {editTitle.length}/255
      </Box>
      
      <Box>
        <textarea
          value={editDescription}
          onChange={handleTextareaChange}
          placeholder="Description (optional)"
          rows={textareaMinRows}
          maxLength={500}
          disabled={isUpdating}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: `${textareaMinRows * 1.5}em`,
            maxHeight: `${textareaMaxRows * 1.5}em`,
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            backgroundColor: isUpdating ? '#f7fafc' : 'white',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#3182ce'
            e.target.style.boxShadow = '0 0 0 1px #3182ce'
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#e2e8f0'
            e.target.style.boxShadow = 'none'
          }}
        />
        {/* Character count indicator */}
        <Box fontSize="xs" color="gray.400" textAlign="right" mt={1}>
          {editDescription.length}/500
        </Box>
      </Box>
      
      <HStack gap={2} justify="end" w="full">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={isUpdating}
        >
          <FaTimes style={{ marginRight: '4px' }} />
          Cancel
        </Button>
        <Button
          size="sm"
          colorScheme="blue"
          onClick={handleSave}
          loading={isUpdating}
          loadingText="Saving..."
        >
          {!isUpdating && <FaCheck style={{ marginRight: '4px' }} />}
          Save
        </Button>
      </HStack>
      
      {/* 快捷键提示 */}
      <Box fontSize="xs" color="gray.500" textAlign="right">
        Press Ctrl+Enter to save, Esc to cancel
      </Box>
    </VStack>
  )
}

export default InlineEditPdf
