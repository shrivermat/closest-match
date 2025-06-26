from extract_text import extract_embedded_text
from closest_match import find_closest_match
from extract_box import extract_bounding_box
from annotate_pdf import add_callout

def main():
    # Path to the hOCR text file
    search_string = input("Enter the text you want to callout: ")
    
    # Load the search string from a text file
    #with open("search_string.txt", "r", encoding="utf-8") as file:
    #    search_string = file.read().strip()

    # Extract embedded text file (could be done in advance and saved)
    embedded_text_path = extract_embedded_text("hocr page 1.txt")
    
    # Find the closest matching string in the embedded text
    closest_match_string = find_closest_match(embedded_text_path, search_string)

    # Extract the bounding box for the closest matching string
    bbox = extract_bounding_box(embedded_text_path, closest_match_string)
    
    print(f"The bounding box for the closest matching string is: {bbox}")
    
    # Add the annotations to the pdf
    add_callout("8193792 1.pdf", bbox)

    
    

if __name__ == "__main__":
    main()
