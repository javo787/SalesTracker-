import sys

def check_balance(filename):
    with open(filename, 'r') as f:
        content = f.read()

    tags = []
    i = 0
    while i < len(content):
        if content[i:i+2] == '</':
            end = content.find('>', i)
            tag = content[i+2:end].split()[0]
            if not tags:
                print(f"Extra closing tag: {tag} at {i}")
            else:
                last = tags.pop()
                if last != tag:
                    print(f"Mismatched tags: open {last}, close {tag} at {i}")
            i = end + 1
        elif content[i] == '<' and content[i+1] != '!' and content[i+1] != '/' and content[i+1] != ' ':
            end = content.find('>', i)
            if content[end-1] == '/': # Self-closing
                pass
            else:
                tag = content[i+1:end].split()[0]
                # Filter out things that are not JSX tags (like < 0 or generic types if they look like tags)
                if tag.isidentifier() or '.' in tag:
                    tags.append(tag)
            i = end + 1
        else:
            i += 1

    if tags:
        print(f"Unclosed tags: {tags}")
    else:
        print("All tags balanced (roughly)")

check_balance('src/screens/DebtorsScreen.tsx')
