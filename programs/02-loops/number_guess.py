"""Number guessing game

The computer picks a number from 1 to 100 and you guess it. Uses random and a while loop.
"""

import random

secret = random.randint(1, 100)
guesses = 0

print("I'm thinking of a number between 1 and 100.")

while True:
    text = input("Your guess: ")
    if not text.isdigit():
        print("Please type a whole number.")
        continue

    guess = int(text)
    guesses += 1

    if guess < secret:
        print("Too low!")
    elif guess > secret:
        print("Too high!")
    else:
        print(f"Correct! You got it in {guesses} guesses.")
        break
