from docx import Document
import sys

document = Document(sys.argv[1])
for paragraph in document.paragraphs:
    line = paragraph.text.strip()
    if line:
        print(line)
for index, table in enumerate(document.tables, 1):
    print(f'\n[TABEL {index}]')
    for row in table.rows:
        print(' | '.join(cell.text.strip().replace('\n', ' / ') for cell in row.cells))
