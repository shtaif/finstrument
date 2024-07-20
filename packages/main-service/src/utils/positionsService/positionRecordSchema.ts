import { z } from 'zod';

const positionRecordSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  date: z.coerce.date(),
  quantity: z.coerce.number().int(), // TODO: It appears this can be negative (implying a sell rather then buy)
  price: z.coerce.number(), // TODO: Should restrict this to positive-only?
});

type PositionRecord = z.infer<typeof positionRecordSchema>;

export { positionRecordSchema as default, PositionRecord };
