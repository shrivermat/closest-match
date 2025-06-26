from PyPDF2 import PdfReader, PdfWriter
from PyPDF2.generic import DictionaryObject, NameObject, ArrayObject, NumberObject

# Function to create a rectangle annotation
def create_annotation(coords, page_height):
    x1, y1, x2, y2 = coords
    return DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Square"),
        NameObject("/Rect"): ArrayObject([
            NumberObject(x1), 
            NumberObject(page_height - y2),
            NumberObject(x2), 
            NumberObject(page_height - y1)
        ]),
        NameObject("/C"): ArrayObject([NumberObject(1), NumberObject(0), NumberObject(0)]),  # Red color
        NameObject("/Border"): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(1)]),  # Border width
        NameObject("/F"): NumberObject(4)  # Annotation flag for printing
    })

# Function to create a highlight annotation
def create_highlight(coords, page_height):
    x1, y1, x2, y2 = coords
    return DictionaryObject({
        NameObject("/Type"): NameObject("/Annot"),
        NameObject("/Subtype"): NameObject("/Highlight"),
        NameObject("/Rect"): ArrayObject([
            NumberObject(x1), 
            NumberObject(page_height - y2),
            NumberObject(x2), 
            NumberObject(page_height - y1)
        ]),
        NameObject("/C"): ArrayObject([NumberObject(1), NumberObject(1), NumberObject(0)]),  # Yellow color
        NameObject("/QuadPoints"): ArrayObject([
            NumberObject(x1), NumberObject(page_height - y1),
            NumberObject(x2), NumberObject(page_height - y1),
            NumberObject(x1), NumberObject(page_height - y2),
            NumberObject(x2), NumberObject(page_height - y2),
        ]),
        NameObject("/F"): NumberObject(4)  # Annotation flag for printing
    })


def add_callout(pdf_path, bbox):
    # Read the PDF
    reader_new_pdf = PdfReader(pdf_path)
    page_new_pdf = reader_new_pdf.pages[0]
    page_height_new_pdf = page_new_pdf.mediabox[3]  # The height of the page in the new PDF

    # Coordinates for the "ABSTRACT" heading and abstract text
    abstract_heading_coords = bbox  # Including "ABSTRACT" heading

    # Coordinates for the specific line within the abstract
    specific_line_highlight_coords = [1300, 1750, 2198, 1780]  # Estimated for the specified line

    # Create the annotations
    abstract_with_heading_annotation = create_annotation(abstract_heading_coords, page_height_new_pdf)
    specific_line_highlight = create_highlight(specific_line_highlight_coords, page_height_new_pdf)

    # Combine annotations into an ArrayObject
    #annotations_with_abstract_and_highlight = ArrayObject([
    #    abstract_with_heading_annotation,
    #    specific_line_highlight
    #])
    annotations_with_abstract_and_highlight = ArrayObject([
        abstract_with_heading_annotation
    ])


    # Update the page annotations
    page_new_pdf[NameObject("/Annots")] = annotations_with_abstract_and_highlight

    # Write the output PDF file
    output_pdf_path_with_abstract_and_highlight = pdf_path.replace(".pdf", "") + "_with_callout.pdf"
    writer_with_abstract_and_highlight = PdfWriter()
    writer_with_abstract_and_highlight.add_page(page_new_pdf)
    with open(output_pdf_path_with_abstract_and_highlight, "wb") as f_out_with_abstract_and_highlight:
        writer_with_abstract_and_highlight.write(f_out_with_abstract_and_highlight)
