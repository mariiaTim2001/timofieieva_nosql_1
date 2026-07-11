# timofieieva_nosql_1

Датасет: [Spotify Tracks Dataset](https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset) (114 000 треків), MongoDB Atlas, база `spotify`.

## Структура

```
requirements.txt
.env                    # MONGO_URI (не в git)
data/dataset.csv        # CSV з Kaggle (не в git)
scripts/01_load_data.py   # Частина 1.1
scripts/02_transform.js   # Частина 1.2
queries/part2_queries.js  # Частина 2
queries/part3_analytics.js  # Частина 3
part4_indexes.js          # Частина 4
```

## Запуск

```bash
pip install -r requirements.txt
echo "MONGO_URI=mongodb+srv://<user>:<password>@cluster0.h6dt2d5.mongodb.net/?appName=Cluster0" > .env

python3 scripts/01_load_data.py
mongosh "$MONGO_URI" --file scripts/02_transform.js
mongosh "$MONGO_URI" --file queries/part2_queries.js
mongosh "$MONGO_URI" --file queries/part3_analytics.js
mongosh "$MONGO_URI" --file part4_indexes.js
```

`tracks_raw`: 113 999 документів (1 рядок відкинуто — без `artists`/`track_name`). `tracks` після трансформації: 113 999.

---

## Частина 1

**1. Чому `audio_features` — окремий об'єкт?** Це смисловий кластер полів, які завжди читаються/фільтруються разом і відокремлені від метаданих треку. Вигідно для проєкцій, індексів по кількох аудіофічах і атомарного оновлення блоку. Проблеми: довші шляхи в запитах (`audio_features.x`) і складніше агрегувати разом із кореневими полями без `$addFields`.

**2. Чому `artists` — масив?** Трек може мати кількох виконавців. Масив дозволяє `$unwind`+`$group` по кожному виконавцю, точний пошук `{artists: "Ім'я"}` без парсингу рядка в кожному запиті, та multikey-індекс.

**3. `$out` vs `$merge`.** `$out` повністю замінює цільову колекцію результатом пайплайна. `$merge` дозаписує або оновлює колекцію інкрементально, не видаляючи документи, яких немає у поточному пайплайні, і може писати в іншу базу. `$out` потрібний тут, бо `tracks` щоразу повністю перебудовується з `tracks_raw`.

## Частина 2

**1. Навіщо `$unwind`?** Розгортає масив у N окремих документів, щоб групувати або фільтрувати по кожному елементу окремо.

**2. `$stdDevPop` vs `$stdDevSamp`.** `$stdDevPop` ділить на N, `$stdDevSamp` — на N−1. Тут усі треки жанру в колекції — повна сукупність, тому обрано `$stdDevPop`.

## Частина 3

**1. Поріг 1 vs 5 vs 50 треків.** При порозі ≥1 у топ потрапляють виконавці з однією піснею (Bizarrap, Quevedo — avg_popularity 99 на 1 треку) — це шум малої вибірки, а не стабільна якість каталогу. При порозі >50 топ змінюється повністю (лідер — The Neighbourhood, 75.6 на 60 треках): молоді артисти з кількома хітами відсіюються, а прогулові каталоги з десятками треків регресують до середнього. Поріг — компроміс між надійністю оцінки й охопленням.

**2. Поріг 100 vs 50 треків жанру.** Результат не змінюється: у датасеті кожен жанр має рівно 1000 треків (крім k-pop — 999), що набагато вище обох порогів, тому фільтр просто не спрацьовує на цих даних.

## Частина 4

Запит `{track_genre:"pop", "audio_features.danceability":{$gte:0.7}}.sort({popularity:-1})`:

| | До індексу | Після індексу |
|---|---|---|
| stage | SORT над COLLSCAN | FETCH → SORT → IXSCAN |
| totalDocsExamined | 113 999 | 354 |
| totalKeysExamined | 0 | 354 |
| executionTimeMillis | 87 | 2 |

Індекс: `{track_genre:1, "audio_features.danceability":1, popularity:-1}` (ESR: Equality→Sort→Range).

**1. Що змінилось?** COLLSCAN замінився на IXSCAN, документів опрацьовано в ~320 разів менше, час впав з 87 до 2 мс. SORT лишився, але тепер сортує вже відфільтровану невелику вибірку.

**2. Як зрозуміти, що індекс використовується?** У `winningPlan` з'являється `IXSCAN` з `indexName` замість `COLLSCAN`, `totalKeysExamined` стає близьким до `totalDocsExamined` і набагато меншим за розмір колекції.

**Індекс для фонової роботи:** `{"audio_features.instrumentalness":1, "audio_features.speechiness":1, explicit:1}`. Explain підтверджує IXSCAN з цим indexName, totalDocsExamined 16 141 ≈ nReturned (а не 113 999).

**Чи покривний запит `{track_genre:"pop", popularity:{$gte:70}}`?** Ні. `explain()` показує стадію `FETCH` і `totalDocsExamined: 317` (>0) — бо запит без проєкції повертає весь документ, включно з полями, яких немає в індексі (`_id`, `track_name`, `artists` тощо). Щоб зробити покривним, потрібна проєкція `{_id:0, track_genre:1, popularity:1}` і індекс, що містить лише ці поля.
