UPDATE "User"
SET "avatarColor" = '#0086f2'
WHERE LOWER("avatarColor") = '#6366f1';

UPDATE "Workspace"
SET "color" = '#0086f2'
WHERE LOWER("color") = '#6366f1';

UPDATE "Label"
SET "color" = '#0086f2'
WHERE LOWER("color") = '#6366f1';
