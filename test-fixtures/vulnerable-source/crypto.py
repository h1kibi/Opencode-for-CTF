# Vulnerable Python crypto script for testing ctf-artifact-analyze
import hashlib
from Crypto.Cipher import AES
import random

def weak_hash(password):
    return hashlib.md5(password.encode()).hexdigest()  # Weak: md5

def ecb_encrypt(key, data):
    cipher = AES.new(key, AES.MODE_ECB)  # Weak: ECB mode
    return cipher.encrypt(data)

def insecure_random():
    return random.randint(0, 1000000)  # Weak: not crypto-safe random

HARDCODED_KEY = "supersecretkey123"  # Secret
FLAG = "flag{crypto_test_flag_67890}"
