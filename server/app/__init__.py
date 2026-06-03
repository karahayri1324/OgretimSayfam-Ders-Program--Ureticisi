"""ÖğretimSayfam — api4 köprü (bridge) servisi.

Electron uygulaması ile kullanıcının PC'sinde çalışan vLLM modeli arasında durur.
Auth, kota (rate limit), demo/abonelik kapısı ve inference-contract mesaj inşası
bu katmanda yapılır. Gerçek LLM çıkarımı upstream (vLLM) tarafında olur.
"""

__version__ = "1.0.0"
