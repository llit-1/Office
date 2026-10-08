-- Run against RKNETDB before deploying the updated Location model.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.Locations', N'Delivery') IS NULL
BEGIN
    ALTER TABLE dbo.Locations ADD Delivery int NOT NULL
        CONSTRAINT DF_Locations_Delivery DEFAULT (0) WITH VALUES;
    EXEC(N'ALTER TABLE dbo.Locations ADD CONSTRAINT CK_Locations_Delivery CHECK (Delivery IN (0, 1))');
END;

COMMIT TRANSACTION;
