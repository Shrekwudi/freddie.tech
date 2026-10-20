"""Password strength checker

Scores a password on length and the kinds of characters it uses.
"""

import string


def check(password):
    tips = []
    score = 0

    if len(password) >= 12:
        score += 2
    elif len(password) >= 8:
        score += 1
        tips.append("Use 12 or more characters.")
    else:
        tips.append("Too short - use at least 8 characters, ideally 12+.")

    checks = [
        (string.ascii_lowercase, "Add lowercase letters."),
        (string.ascii_uppercase, "Add uppercase letters."),
        (string.digits, "Add some numbers."),
        (string.punctuation, "Add a symbol such as ! or #."),
    ]
    for chars, tip in checks:
        if any(c in chars for c in password):
            score += 1
        else:
            tips.append(tip)

    return score, tips


pw = input("Enter a password to test (it is not stored): ")
score, tips = check(pw)
rating = ["Very weak", "Very weak", "Weak", "OK", "Good", "Strong", "Very strong"][score]

print(f"Score: {score}/6 - {rating}")
for tip in tips:
    print(" -", tip)
