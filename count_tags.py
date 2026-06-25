import sys

def count_tags(filename):
    with open(filename, 'r') as f:
        content = f.read()

    tags = ['View', 'Text', 'TouchableOpacity', 'Modal', 'KeyboardAvoidingView', 'FlatList', 'TextInput']
    for tag in tags:
        opening = content.count(f'<{tag}')
        closing = content.count(f'</{tag}>')
        self_closing = 0
        # Rough check for self-closing tags
        start = 0
        while True:
            start = content.find(f'<{tag}', start)
            if start == -1: break
            end = content.find('>', start)
            if end == -1: break
            if content[end-1] == '/':
                self_closing += 1
            start = end

        print(f"{tag}: opening={opening}, closing={closing}, self_closing={self_closing}, balanced={opening == closing + self_closing}")

count_tags('src/screens/DebtorsScreen.tsx')
