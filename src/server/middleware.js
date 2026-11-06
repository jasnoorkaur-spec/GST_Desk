export const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({ message: issue?.message || 'Please check the information and try again.', fields: parsed.error.flatten().fieldErrors });
    }
    req.validatedBody = parsed.data;
    next();
  };
}

export function appErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That record already exists. Please choose a different value.' });
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'A selected customer or product is no longer available.' });
  if (Number(error?.status) >= 400 && Number(error?.status) < 600) return res.status(Number(error.status)).json({ message: error.message || 'Please check the information and try again.' });
  if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Logo files must be 2 MB or smaller.' });
  console.error('Application request failed:', error?.message || 'Unknown error');
  return res.status(500).json({ message: 'We could not complete that request. Please try again.' });
}
