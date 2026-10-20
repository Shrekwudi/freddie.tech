"""Caesar cipher

Encrypts or decrypts a message by shifting each letter along the alphabet.
"""


def shift_text(text, shift):
    result = ""
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            result += chr((ord(ch) - base + shift) % 26 + base)
        else:
            result += ch
    return result


mode = input("(e)ncrypt or (d)ecrypt? ").strip().lower()
message = input("Message: ")
key = int(input("Shift (1-25): "))

if mode.startswith("d"):
    key = -key

print("Result:", shift_text(message, key))
