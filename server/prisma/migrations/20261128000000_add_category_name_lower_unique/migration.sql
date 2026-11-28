-- F-10: category names are unique ignoring letter case ("Audio" and "audio" are one category).
-- Hand-written, because Prisma cannot express an index on an expression. Additive: drop the index to roll back.
-- The existing UNIQUE ("name") stays.
CREATE UNIQUE INDEX "Category_name_lower_key" ON "Category" (lower("name"));
