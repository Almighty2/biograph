import sys
import json
import pytesseract
from PIL import Image
import cv2
import re
import numpy as np

# Spécifie le chemin vers Tesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def preprocess_image(image_path):
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Appliquer un seuillage adaptatif
    thresh = cv2.adaptiveThreshold(gray, 255,
                                   cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 31, 15)
    return thresh

def extract_text(image):
    return pytesseract.image_to_string(image, lang='fra')

def extract_fields(text):
    text = text.replace('\n', ' ').replace('\r', '').strip()
    
    # Nettoyage optionnel
    text = re.sub(r'\s+', ' ', text)

    # Tentatives robustes pour chaque champ
    numero = re.search(r'CIO\d{6,}', text)
    nom = re.search(r'Nom[\s:]*([A-ZÉOA\s]{2,})', text, re.IGNORECASE)
    prenoms = re.search(r'Pr[ée]nom\(s\)[\s:]*([A-Z\s\-]+)', text, re.IGNORECASE)
    date_naissance = re.search(r'(\d{2}/\d{2}/\d{4})', text)
    taille = re.search(r'(\d,\d{2}|\d\.\d{2})', text)
    nationalite = re.search(r'(IVOIRIENNE|FRAN[ÇC]AISE|MALIENNE)', text, re.IGNORECASE)
    lieu_naissance = re.search(r'Naissance[\s:]*([A-Z\s\(\)]+)', text, re.IGNORECASE)
    expiration = re.search(r'(\d{2}/\d{2}/\d{4})$', text)

    return {
        "numero": numero.group(1) if numero else None,
        "nom": nom.group(1).strip() if nom else None,
        "prenoms": prenoms.group(1).strip() if prenoms else None,
        "date_naissance": date_naissance.group(1) if date_naissance else None,
        "taille": taille.group(1) if taille else None,
        "nationalite": nationalite.group(1).upper() if nationalite else None,
        "lieu_naissance": lieu_naissance.group(1).strip() if lieu_naissance else None,
        "expiration": expiration.group(1) if expiration else None
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucun fichier image fourni"}))
        return

    image_path = sys.argv[1]

    try:
        processed_image = preprocess_image(image_path)
        raw_text = extract_text(processed_image)
        parsed_data = extract_fields(raw_text)

        print(json.dumps({
            "raw_text": raw_text,
            "parsed_data": parsed_data
        }, ensure_ascii=False, indent=2))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
