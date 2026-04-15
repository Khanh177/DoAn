# dùng chung cho main.py và futures.py để tránh circular import
price_cache = {"price": None, "ts": None}
