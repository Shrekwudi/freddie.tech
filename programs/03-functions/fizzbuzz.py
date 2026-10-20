"""FizzBuzz

The classic exercise, written as a function that returns the word for each number.
"""


def fizzbuzz(n):
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)


for number in range(1, 31):
    print(fizzbuzz(number))
