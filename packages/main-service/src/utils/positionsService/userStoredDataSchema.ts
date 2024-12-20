import { z } from 'zod';
import positionRecordSchema from './positionRecordSchema.js';

const userStoredDataSchema = z.object({
  lots: z.array(positionRecordSchema),
});

type UserStoredData = z.infer<typeof userStoredDataSchema>;

export { userStoredDataSchema as default, UserStoredData };
