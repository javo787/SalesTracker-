import sys

def count_tags(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()

    tags = ['View', 'Text', 'TouchableOpacity', 'Modal', 'KeyboardAvoidingView', 'FlatList', 'TextInput']
    for tag in tags:
        opening = 0
        closing = 0
        self_closing = 0
        for line in lines:
            line = line.strip()
            # Count <Tag
            start = 0
            while True:
                start = line.find(f'<{tag}', start)
                if start == -1: break
                # Check it's a tag, not part of something else
                if start + len(tag) + 1 < len(line) and line[start + len(tag) + 1] not in (' ', '>', '/'):
                    start += 1
                    continue

                opening += 1
                end = line.find('>', start)
                if end != -1 and line[end-1] == '/':
                    self_closing += 1
                start += 1

            # Count </Tag>
            closing += line.count(f'</{tag}>')

        print(f"{tag}: opening={opening}, closing={closing}, self_closing={self_closing}, balanced={opening == closing + self_closing}")

count_tags('src/screens/DebtorsScreen.tsx')
