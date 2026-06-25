import re

def check(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Remove comments
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

    tags = ['View', 'Text', 'TouchableOpacity', 'Modal', 'KeyboardAvoidingView', 'FlatList', 'TextInput', 'RefreshControl', 'Ionicons']

    for tag in tags:
        # Find all <Tag or <Tag ... > or <Tag ... />
        open_tags = re.findall(f'<{tag}(\\s+[^>]*?)?>', content, re.DOTALL)
        # Find all self-closing <Tag ... />
        self_closing = re.findall(f'<{tag}(\\s+[^>]*?)?/>', content, re.DOTALL)
        # Find all </Tag>
        close_tags = re.findall(f'</{tag}>', content)

        total_open = len(open_tags)
        total_self = len(self_closing)
        total_close = len(close_tags)

        # Real opening tags are those that are NOT self-closing
        # Note: re.findall(f'<{tag}(\\s+[^>]*?)?>', ...) will match both <Tag> and <Tag/>
        # So we subtract self_closing from open_tags
        real_opening = total_open - total_self

        print(f"{tag}: real_opening={real_opening}, close_tags={total_close}, self_closing={total_self}, balanced={real_opening == total_close}")
        if real_opening != total_close:
            print(f"  FAILED: {tag} is NOT balanced!")

check('src/screens/DebtorsScreen.tsx')
