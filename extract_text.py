from bs4 import BeautifulSoup

def extract_embedded_text(hocr_path):
    with open(hocr_path, 'r', encoding="utf-8") as file:
        soup = BeautifulSoup(file, 'html.parser')

    embedded_text = []

    # For each paragraph in the hOCR data
    for paragraph in soup.find_all(class_="ocr_par"):
        embedded_text.append("[[PARAGRAPH]]")
        
        # For each line in the paragraph
        for line in paragraph.find_all(class_="ocr_line"):
            line_bbox = line['title'].split(';')[0].split(' ')[1:]
            embedded_text.append(f"[[LINE {' '.join(line_bbox)}]]")
            
            # For each word in the line
            for word in line.find_all(class_="ocrx_word"):
                embedded_text.append(word.get_text())

    # Combine all elements into a single string
    embedded_text_str = ' '.join(embedded_text)

    # Save the embedded text to a .txt file
    embedded_text_path = "embedded_text.txt"
    with open(embedded_text_path, "w", encoding="utf-8") as file:
       file.write(embedded_text_str)

    #return embedded_text_path
    return embedded_text_str

