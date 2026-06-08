#!/bin/bash
# Zip everything except PDFs inside the SCIENCE directory
zip -r my_archive.zip . -x "SCIENCE/NCERT-EXAMPLER/*" "SCIENCE/NCERT-PDF/*" "SCIENCE/REFERENCE-BOOKS-SOURCE/*" ".git/*" "zip.sh" "node_modules/*" ".venv/*" "__pycache__/*"