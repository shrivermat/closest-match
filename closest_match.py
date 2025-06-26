import re

def sequence_similarity(seq1, seq2):
    return sum(1 for a, b in zip(seq1, seq2) if a == b) / max(len(seq1), len(seq2))

def find_closest_match(embedded_text, search_string):
    #with open(embedded_text_path, "r", encoding="utf-8") as file:
    #    embedded_text = file.read()

    # Remove all content between [[ and ]]
    cleaned_embedded_text = re.sub(r'\[\[.*?\]\] ', '', embedded_text)
    cleaned_embedded_text_words = cleaned_embedded_text.split()

    search_string_words = search_string.split()
    window_size_words = len(search_string_words)

    best_match = None
    best_similarity = 0

    for i in range(len(cleaned_embedded_text_words) - window_size_words + 1):
        word_sequence = cleaned_embedded_text_words[i:i+window_size_words]
        similarity_score = sequence_similarity(word_sequence, search_string_words)

        if similarity_score > best_similarity:
            best_similarity = similarity_score
            best_match = ' '.join(word_sequence)

    # Debug print statements
    print("closest_match.py:", best_similarity)
    print("best_match:", best_match)

    return best_match
