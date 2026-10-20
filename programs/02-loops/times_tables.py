"""Times tables

Prints a times table for any number using a for loop and range().
"""

n = int(input("Which times table? "))

for i in range(1, 13):
    print(f"{i:>2} x {n} = {i * n}")
