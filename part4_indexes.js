use("spotify");

print("\n=== Завдання 1 ===");

db.tracks.dropIndexes();

const beforeExplain = db.tracks.find(
  { track_genre: "pop", "audio_features.danceability": { $gte: 0.7 } }
).sort({ popularity: -1 }).explain("executionStats");

print("winningPlan.stage: " + beforeExplain.queryPlanner.winningPlan.stage);
print("nReturned: " + beforeExplain.executionStats.nReturned);
print("totalDocsExamined: " + beforeExplain.executionStats.totalDocsExamined);
print("totalKeysExamined: " + beforeExplain.executionStats.totalKeysExamined);
print("executionTimeMillis: " + beforeExplain.executionStats.executionTimeMillis);
printjson(beforeExplain.queryPlanner.winningPlan);

print("\n--- Створення індексу idx_genre_danceability_popularity ---");
db.tracks.createIndex(
  { track_genre: 1, "audio_features.danceability": 1, popularity: -1 },
  { name: "idx_genre_danceability_popularity" }
);

const afterExplain = db.tracks.find(
  { track_genre: "pop", "audio_features.danceability": { $gte: 0.7 } }
).sort({ popularity: -1 }).explain("executionStats");

print("winningPlan.stage: " + afterExplain.queryPlanner.winningPlan.stage);
print("nReturned: " + afterExplain.executionStats.nReturned);
print("totalDocsExamined: " + afterExplain.executionStats.totalDocsExamined);
print("totalKeysExamined: " + afterExplain.executionStats.totalKeysExamined);
print("executionTimeMillis: " + afterExplain.executionStats.executionTimeMillis);
printjson(afterExplain.queryPlanner.winningPlan);

print("\n=== Завдання 2 ===");

db.tracks.createIndex(
  {
    "audio_features.instrumentalness": 1,
    "audio_features.speechiness": 1,
    explicit: 1
  },
  { name: "idx_instrumentalness_speechiness_explicit" }
);

const workExplain = db.tracks.find({
  "audio_features.instrumentalness": { $gt: 0.5 },
  "audio_features.speechiness": { $lt: 0.1 },
  explicit: false
}).explain("executionStats");

print("winningPlan.stage: " + workExplain.queryPlanner.winningPlan.stage);
print("nReturned: " + workExplain.executionStats.nReturned);
print("totalDocsExamined: " + workExplain.executionStats.totalDocsExamined);
print("totalKeysExamined: " + workExplain.executionStats.totalKeysExamined);
printjson(workExplain.queryPlanner.winningPlan);

print("\n=== Завдання 3 ===");

const coveredExplain = db.tracks.find(
  { track_genre: "pop", popularity: { $gte: 70 } }
).explain("executionStats");

print("winningPlan.stage: " + coveredExplain.queryPlanner.winningPlan.stage);
print("totalDocsExamined: " + coveredExplain.executionStats.totalDocsExamined);
print("totalKeysExamined: " + coveredExplain.executionStats.totalKeysExamined);
print("(totalDocsExamined > 0 означає, що це не покривний запит)");
printjson(coveredExplain.queryPlanner.winningPlan);

print("\n=== Індекси колекції tracks ===");
printjson(db.tracks.getIndexes());
