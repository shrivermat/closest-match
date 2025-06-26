from bs4 import BeautifulSoup
import re

def sequence_similarity(seq1, seq2):
    return sum(1 for a, b in zip(seq1, seq2) if a == b) / max(len(seq1), len(seq2))

def extract_bounding_box(embedded_text_path, closest_match_string):
    # Load the embedded text
    #with open(embedded_text_path, "r", encoding="utf-8") as file:
    #    loaded_embedded_text = file.read()
    loaded_embedded_text = embedded_text_path
    
    # Calculate similarity score sliding from the end to the beginning
    best_similarity = 0
    best_match = None
    best_start_index = None
    best_end_index = None
    
    search_words = closest_match_string.split()
    search_length = len(closest_match_string)
    
    for end_index in range(len(loaded_embedded_text), search_length, -1):
        start_index = end_index - search_length
        window_text = loaded_embedded_text[start_index:end_index]
        cleaned_window = re.sub(r'\[\[.*?\]\] ', '', window_text)  # Remove the indicators
        similarity = sequence_similarity(cleaned_window, closest_match_string[:len(cleaned_window)])
        
    for end_index in range(len(loaded_embedded_text), search_length, -1):
        start_index = end_index - search_length
        while True:
            window_text = loaded_embedded_text[start_index:end_index]
            cleaned_window = re.sub(r'\[\[.*?\]\] ', '', window_text)  # Remove the indicators
            if len(cleaned_window) >= search_length:
                break
            start_index -= (search_length - len(cleaned_window))
        similarity = sequence_similarity(cleaned_window, closest_match_string)

        if similarity > best_similarity:
            best_similarity = similarity
            best_match = cleaned_window
            best_start_index = start_index
            best_end_index = end_index
            
        if best_similarity > 0.85:  # Stop if similarity is above a certain threshold
            break

    first_num = 0
    second_num = 0
    third_num = 0
    fourth_num = 0
    max_third_num = 0

    matches = [match.group() for match in re.finditer(r'\[\[LINE .*?\]\]', loaded_embedded_text[:best_start_index])]
    if matches:
        my_vals = matches[-1]
        numbers = re.findall(r'\d+', my_vals)
        first_num = int(numbers[0])
        second_num = int(numbers[1])
        max_third_num = int(numbers[2])
    else:
        print("Pattern not found!")

    end_matches = [match.group() for match in re.finditer(r'\[\[LINE .*?\]\]', loaded_embedded_text[best_start_index:best_end_index])]
    if end_matches:
        #max_third_num = 0  # Initialize the maximum third number
        for match in end_matches:
            numbers = re.findall(r'\d+', match)
            third_num = int(numbers[2])
            if third_num > max_third_num:
                max_third_num = third_num
        my_end_vals = end_matches[-1]
        numbers = re.findall(r'\d+', my_end_vals)
        fourth_num = int(numbers[3])
        third_num = max_third_num  # Update third_num with the maximum value found
    else:
        print("Pattern not found!")

    return [first_num, second_num, third_num, fourth_num]