"""Generates the FB2 samples in samples/ (original text, no third-party content).

    python scripts/make-fb2-samples.py
"""
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def fb2(encoding, lang, title, author, heading, chapter_names, paragraphs, repeat, notes):
    """Builds a book whose chapters repeat `paragraphs`.

    `notes` maps (chapter number, paragraph index) to the note text placed there.
    """
    first, last = author
    note_texts = []
    sections = []
    for chapter, name in enumerate(chapter_names, 1):
        body = []
        for index, paragraph in enumerate(paragraphs * repeat):
            text = escape(paragraph)
            note = notes.get((chapter, index))
            if note:
                note_texts.append(note)
                number = len(note_texts)
                text += f' <a l:href="#n{number}" type="note">[{number}]</a>'
            body.append(f"<p>{text}</p>")
        sections.append(
            f"<section><title><p>{escape(f'{heading} {chapter}. {name}')}</p></title>\n"
            + "\n".join(body)
            + "</section>"
        )
    note_sections = "\n".join(
        f'<section id="n{number}"><title><p>{number}</p></title><p>{escape(text)}</p></section>'
        for number, text in enumerate(note_texts, 1)
    )
    sections = "\n".join(sections)
    return f"""<?xml version="1.0" encoding="{encoding}"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>prose</genre>
<author><first-name>{escape(first)}</first-name><last-name>{escape(last)}</last-name></author>
<book-title>{escape(title)}</book-title>
<lang>{lang}</lang>
</title-info>
<document-info><program-used>make-fb2-samples.py</program-used><version>1.0</version></document-info>
</description>
<body>
<title><p>{escape(title)}</p></title>
{sections}
</body>
<body name="notes">
<title><p>Notes</p></title>
{note_sections}
</body>
</FictionBook>
"""


UK_PARAGRAPHS = [
    "Ранок у містечку починався з дзвону на старій вежі. Ґрунтова дорога ще парувала після нічного дощу, "
    "а з пекарні на розі вже пахло свіжим хлібом і кмином.",
    "Їжак, що жив під ґанком бібліотеки, щоранку виходив подивитися на перехожих. Його знали всі діти, "
    "і кожен вважав своїм обов'язком принести йому яблуко чи грушу.",
    "Бібліотекарка Євгенія відчиняла двері рівно о дев'ятій. Вона казала, що книжки не люблять поспіху, "
    "а читачі — зачинених дверей.",
    "Над річкою стелився туман, і човни здавалися пташками, що задрімали на воді. Хтось на тому березі "
    "співав пісню, слів якої ніхто вже не пам'ятав.",
    "Увечері на площі збиралися сусіди: говорили про погоду, ціни на ярмарку і про те, що цього року "
    "вишні вродили, як ніколи раніше.",
]

EN_PARAGRAPHS = [
    "The lighthouse keeper wrote one line in the logbook every evening, whatever the weather.",
    "On calm nights the line was short. On stormy nights it was still one line, only written more firmly.",
    "Ships passed without knowing his name, and he preferred it that way.",
]


def uk_sample():
    return fb2(
        "windows-1251", "uk", "Зразок: Містечко над річкою", ("Тестовий", "Автор"),
        "Розділ", ["Ранок", "Бібліотека", "Вечір над річкою"], UK_PARAGRAPHS, 4,
        {
            (1, 0): "Вежу збудували ще до того, як містечко отримало свою назву.",
            (2, 2): "Євгенія працювала в бібліотеці сорок років і знала напам'ять розташування кожної полиці.",
        },
    )


def en_sample():
    return fb2(
        "utf-8", "en", "Sample: The Lighthouse", ("Sample", "Author"),
        "Chapter", ["The Logbook", "The Storm"], EN_PARAGRAPHS, 6,
        {(1, 1): "The logbook is kept in the museum by the harbour."},
    )


if __name__ == "__main__":
    (SAMPLES / "sample-windows-1251.fb2").write_bytes(uk_sample().encode("cp1251"))
    with zipfile.ZipFile(SAMPLES / "sample-utf8.fb2.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("sample-utf8.fb2", en_sample().encode("utf-8"))
    print("written to", SAMPLES)
