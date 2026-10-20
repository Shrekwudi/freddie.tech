"""Temperature converter

Converts between Celsius and Fahrenheit using if/elif/else.
"""

print("1) Celsius to Fahrenheit")
print("2) Fahrenheit to Celsius")
choice = input("Choose 1 or 2: ").strip()

if choice == "1":
    c = float(input("Temperature in °C: "))
    print(f"{c:.1f} °C = {c * 9 / 5 + 32:.1f} °F")
elif choice == "2":
    f = float(input("Temperature in °F: "))
    print(f"{f:.1f} °F = {(f - 32) * 5 / 9:.1f} °C")
else:
    print("That wasn't 1 or 2.")
