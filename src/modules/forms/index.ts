import { checkDatabaseConnection, markDatabaseOffline } from '@/lib/prisma';
import { localCache } from '@/modules/cache';
import { FormController } from '@/modules/forms/controllers/form.controller';
import { PrismaFormRepository } from '@/modules/forms/repositories/prisma-form.repository';
import { AdminAuthorizationService } from '@/modules/forms/services/admin-authorization.service';
import { FormPersistenceService } from '@/modules/forms/services/form-persistence.service';

const formRepository = new PrismaFormRepository();
const adminAuthorizationService = new AdminAuthorizationService();

export const formPersistenceService = new FormPersistenceService(
  formRepository,
  localCache,
  { check: checkDatabaseConnection, markOffline: markDatabaseOffline }
);
export const formController = new FormController(formPersistenceService, adminAuthorizationService);

export { AdminAuthorizationService, FormController, FormPersistenceService, PrismaFormRepository };
export type { FormRepository } from '@/modules/forms/repositories/form.repository';
export type * from '@/modules/forms/types/form.types';
