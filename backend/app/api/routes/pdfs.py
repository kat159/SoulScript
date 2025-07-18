import uuid
from typing import List
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
    Form,
)
from sqlmodel import Session, select
from app.api.deps import CurrentUser, SessionDep, check_upload_concurrency
from app.core.config import settings
from app.models import (
    PDFDocument,
    PDFDocumentCreate,
    PDFDocumentUpdate,
    PDFDocumentPublic,
    PDFDocumentsPublic,
)
from app.services.pdf_service import pdf_service
from app.utils import validate_pdf_integrity
from app.util.redis_client import RedisSlot

router = APIRouter()


@router.post("/", response_model=PDFDocumentPublic)
def create_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    title: str = Form(...),
    description: str = Form(None),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks,
    concurrency_slot: RedisSlot = Depends(check_upload_concurrency(settings.ROUTE_UPLOAD_MAX_CONCURRENT)),
) -> PDFDocumentPublic:
    """
    Create new PDF document.
    """
    # Check if user is superuser (admin)
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions. Only admins can upload PDFs.",
        )

    # Validate file type
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    # Check file size limit (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes

    # Read file content
    try:
        file_content = file.file.read()
        file_size = len(file_content)

        # Check if file size exceeds limit
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size ({file_size / (1024*1024):.2f} MB) exceeds the maximum allowed size of 10 MB.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

    # Validate PDF file integrity - check if file can be opened and read
    error_message = validate_pdf_integrity(file_content)
    if error_message:
        raise HTTPException(status_code=400, detail=error_message)

    # Save file to storage
    try:
        file_path = pdf_service.save_pdf_file(file_content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

    # Create PDF document record
    pdf_document = PDFDocument(
        title=title,
        description=description,
        filename=file_path,
        file_size=file_size,
        page_count=0,
        is_processed=False,
        processing_status="pending",
        owner_id=current_user.id,
    )

    db.add(pdf_document)
    db.commit()
    db.refresh(pdf_document)

    # Process PDF in background
    
    return PDFDocumentPublic.from_orm(pdf_document)


@router.get("/", response_model=PDFDocumentsPublic)
def read_pdf_documents(
    db: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> PDFDocumentsPublic:
    """
    Retrieve PDF documents.
    """
    # Only admins can see all PDFs, regular users see only their own
    if current_user.is_superuser:
        statement = select(PDFDocument).offset(skip).limit(limit)
        count_statement = select(PDFDocument)
    else:
        statement = (
            select(PDFDocument)
            .where(PDFDocument.owner_id == current_user.id)
            .offset(skip)
            .limit(limit)
        )
        count_statement = select(PDFDocument).where(
            PDFDocument.owner_id == current_user.id
        )

    pdf_documents = db.exec(statement).all()
    total_count = len(db.exec(count_statement).all())

    return PDFDocumentsPublic(data=pdf_documents, count=total_count)


@router.get("/{pdf_id}", response_model=PDFDocumentPublic)
def read_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
) -> PDFDocumentPublic:
    """
    Get PDF document by ID.
    """
    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Check permissions
    if not current_user.is_superuser and pdf_document.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    return PDFDocumentPublic.from_orm(pdf_document)


@router.put("/{pdf_id}", response_model=PDFDocumentPublic)
def update_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
    pdf_document_in: PDFDocumentUpdate,
) -> PDFDocumentPublic:
    """
    Update PDF document.
    """
    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Check permissions
    if not current_user.is_superuser and pdf_document.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Update fields
    update_data = pdf_document_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pdf_document, field, value)

    db.add(pdf_document)
    db.commit()
    db.refresh(pdf_document)

    return PDFDocumentPublic.from_orm(pdf_document)


@router.get("/{pdf_id}/download")
def download_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
):
    """
    Download PDF document.
    """
    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Check permissions
    if not current_user.is_superuser and pdf_document.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Check if file exists
    import os

    if not os.path.exists(pdf_document.filename):
        raise HTTPException(status_code=404, detail="PDF file not found")

    # Read file and return as response
    from fastapi.responses import FileResponse

    return FileResponse(
        path=pdf_document.filename,
        filename=f"{pdf_document.title}.pdf",
        media_type="application/pdf",
    )


@router.delete("/{pdf_id}")
def delete_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
) -> dict:
    """
    Delete PDF document.
    """
    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Check permissions
    if not current_user.is_superuser and pdf_document.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        import logging

        logger = logging.getLogger(__name__)
        logger.info(f"Starting deletion process for PDF {pdf_id}")

        # Delete embeddings from ChromaDB (don't fail if this doesn't work)
        try:
            logger.info(f"Attempting to delete ChromaDB embeddings for PDF {pdf_id}")
            result = pdf_service.delete_pdf_embeddings(pdf_id)
            logger.info(f"ChromaDB deletion result: {result}")
        except Exception as e:
            # Log but don't fail the deletion
            logger.warning(f"Failed to delete embeddings for PDF {pdf_id}: {e}")

        # Delete file from storage
        import os

        if os.path.exists(pdf_document.filename):
            try:
                logger.info(f"Deleting file: {pdf_document.filename}")
                os.remove(pdf_document.filename)
                logger.info(f"Successfully deleted file: {pdf_document.filename}")
            except Exception as e:
                # Log but don't fail the deletion
                logger.warning(f"Failed to delete file {pdf_document.filename}: {e}")
        else:
            logger.warning(f"File not found: {pdf_document.filename}")

        # Delete from database
        logger.info(f"Deleting PDF record from database: {pdf_id}")
        db.delete(pdf_document)
        db.commit()
        logger.info(f"Successfully deleted PDF {pdf_id} from database")

        return {"message": "PDF document deleted successfully"}

    except Exception as e:
        # Rollback database changes if there was an error
        logger.error(f"Error during PDF deletion: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Error deleting PDF document: {str(e)}"
        )


@router.get("/{pdf_id}/status")
def get_pdf_processing_status(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
) -> dict:
    """
    Get PDF processing status.
    """
    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Check permissions
    if not current_user.is_superuser and pdf_document.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    return {
        "id": str(pdf_document.id),
        "processing_status": pdf_document.processing_status,
        "is_processed": pdf_document.is_processed,
        "error_message": pdf_document.error_message,
        "page_count": pdf_document.page_count,
    }


@router.post("/{pdf_id}/reprocess")
def reprocess_pdf_document(
    *,
    db: SessionDep,
    current_user: CurrentUser,
    pdf_id: uuid.UUID,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Reprocess PDF document.
    """
    # Only admins can reprocess PDFs
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions. Only admins can reprocess PDFs.",
        )

    statement = select(PDFDocument).where(PDFDocument.id == pdf_id)
    pdf_document = db.exec(statement).first()

    if not pdf_document:
        raise HTTPException(status_code=404, detail="PDF document not found")

    # Reprocess in background
    background_tasks.add_task(pdf_service.reprocess_pdf, pdf_document, db)

    return {
        "message": "PDF reprocessing started",
        "pdf_id": str(pdf_id),
        "title": pdf_document.title,
    }


@router.get("/chroma/stats")
def get_chroma_stats(
    current_user: CurrentUser,
) -> dict:
    """
    Get ChromaDB statistics.
    """
    # Only admins can view ChromaDB stats
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions. Only admins can view ChromaDB stats.",
        )

    return pdf_service.get_chroma_stats()


@router.post("/chroma/compact")
def compact_chromadb(
    current_user: CurrentUser,
) -> dict:
    """
    Compact ChromaDB collection to reclaim space.
    """
    # Only admins can compact ChromaDB
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions. Only admins can compact ChromaDB.",
        )

    return pdf_service.compact_chromadb()
