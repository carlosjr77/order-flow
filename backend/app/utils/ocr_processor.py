import os
import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
from typing import Optional, Dict, Any
from pathlib import Path


class OCRProcessor:
    """Processador de OCR para extrair informações de notas"""
    
    def __init__(self):
        """Inicializa o processador OCR"""
        self.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(self.tesseract_cmd):
            pytesseract.pytesseract.pytesseract_cmd = self.tesseract_cmd
    
    def processar_imagem(self, image_path: str) -> str:
        """
        Processa uma imagem e extrai texto usando OCR
        
        Args:
            image_path: Caminho da imagem
            
        Returns:
            Texto extraído da imagem
        """
        try:
            # Carregar imagem
            img = cv2.imread(image_path)
            
            if img is None:
                return None
            
            # Pré-processamento
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            gray = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)[1]
            
            # Aplicar OCR
            text = pytesseract.image_to_string(gray, lang='por')
            
            return text
        except Exception as e:
            print(f"Erro ao processar imagem: {str(e)}")
            return None
    
    def processar_pdf(self, pdf_path: str) -> str:
        """
        Processa um PDF e extrai texto
        
        Args:
            pdf_path: Caminho do PDF
            
        Returns:
            Texto extraído do PDF
        """
        try:
            from pdf2image import convert_from_path
            
            # Converter PDF para imagens
            images = convert_from_path(pdf_path)
            
            texto_total = ""
            for image in images:
                # Converter PIL Image para numpy array
                img_array = np.array(image)
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
                gray = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)[1]
                
                # Aplicar OCR
                text = pytesseract.image_to_string(gray, lang='por')
                texto_total += text + "\n"
            
            return texto_total
        except Exception as e:
            print(f"Erro ao processar PDF: {str(e)}")
            return None
    
    def extrair_info_nota(self, texto: str) -> Dict[str, Any]:
        """
        Extrai informações estruturadas da nota usando padrões
        
        Args:
            texto: Texto extraído da nota
            
        Returns:
            Dicionário com informações extraídas
        """
        import re
        
        info = {
            "produtos": [],
            "data": None,
            "fornecedor": None,
            "total": None
        }
        
        linhas = texto.split("\n")
        
        # Procurar por padrões de produtos
        # Formato esperado: CÓDIGO | DESCRIÇÃO | QUANTIDADE | VALOR
        for linha in linhas:
            # Padrão: número seguido de valores
            if re.search(r'\d+(\.\d{2})?', linha):
                # Tentar extrair informações de produto
                partes = re.split(r'\s{2,}', linha.strip())
                
                if len(partes) >= 3:
                    try:
                        quantidade = float(re.findall(r'\d+(\.\d+)?', partes[-2])[0] if re.findall(r'\d+(\.\d+)?', partes[-2]) else 1)
                        valor = float(re.findall(r'\d+\.\d+', partes[-1])[0])
                        
                        info["produtos"].append({
                            "descricao": " ".join(partes[:-2]),
                            "quantidade": quantidade,
                            "valor_unitario": valor
                        })
                    except:
                        pass
        
        return info


if __name__ == "__main__":
    processor = OCRProcessor()
    # Teste
    print("OCR Processor inicializado")
