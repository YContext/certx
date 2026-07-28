from pathlib import Path
from datetime import datetime
import argparse

from utils.csv_handler import read_names
from utils.certificate import build_certificate
from utils.helpers import slugify


def main():
    parser = argparse.ArgumentParser(description='Generate certificates from a template and a CSV')
    parser.add_argument('--template', help='Path to template (.png/.pdf/.pptx)')
    parser.add_argument('--csv', help='Path to participants CSV')
    parser.add_argument('--title', help='Certificate title')
    parser.add_argument('--description', help='Certificate description')
    parser.add_argument('--signatory', help='Staff in charge')
    parser.add_argument('--date', help='Certificate date')
    args = parser.parse_args()

    template = Path(args.template) if args.template else Path(input('Template path: ').strip())
    csv_path = Path(args.csv) if args.csv else Path(input('CSV path: ').strip())

    title = args.title or input('Title [Certificate of Completion]: ').strip() or 'Certificate of Completion'
    description = args.description or input('Description [Awarded for participation]: ').strip() or 'Awarded for participation'
    signatory = args.signatory or input('Staff in charge [Jane Smith]: ').strip() or 'Jane Smith'
    date = args.date or input(f'Date [{datetime.now().strftime("%Y-%m-%d")}]: ').strip() or datetime.now().strftime('%Y-%m-%d')

    df, name_col = read_names(csv_path)
    names = df[name_col].dropna().astype(str).tolist()

    outdir = Path('generated')
    outdir.mkdir(exist_ok=True)

    for i, name in enumerate(names, 1):
        out_path = outdir / f"certificate_{i}_{slugify(name)}.png"
        build_certificate(template, name, title, description, signatory, date, out_path)
        print('Created', out_path)

    print('Done.')


if __name__ == '__main__':
    main()
