// Program veri sınırları — TEK KAYNAK. Aynı sınırların manuel IPC şeması, AI mutation executor
// ve AI schedule executor'da farklı değerlerle tekrarlanması, aynı isteğin bir yoldan kabul
// edilip diğerinden reddedilmesine (ör. AI 100 saatlik ders yazabilirken manuel form 40'ta
// dururken) yol açıyordu. Hepsi buradan beslenmeli.

/** Bir aktivitenin haftalık ders saati üst sınırı (manuel form ve AI ortak). */
export const MAX_WEEKLY_HOURS = 40;

/** Bir bloğun (kesintisiz ders) azami saat sayısı. */
export const MAX_BLOCK_DURATION = 8;

/** Bir günde tanımlanabilecek azami ders saati sayısı (FET slot indeksi 1..20 ile uyumlu). */
export const MAX_HOURS_PER_DAY = 20;

/** Bir günde en az bu kadar ders saati olmalı. */
export const MIN_HOURS_PER_DAY = 1;
