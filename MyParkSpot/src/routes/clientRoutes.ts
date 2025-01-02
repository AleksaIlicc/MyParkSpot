import express from 'express';
import { validateDto } from '../middlewares/validateDto';
import { UpdateAccountDto } from '../dtos/client/update-account.dto';
import { RegisterCarDto } from '../dtos/client/register-car.dto';
import { AddFundsDto } from '../dtos/client/add-funds.dto';
import { CompletePaymentDto } from '../dtos/client/complete-payment.dto';
import authenticatedGuard from '../middlewares/authenticatedGuard';

import clientController from '../controllers/clientController';

const router = express.Router();

// Get methods
router.get('/account', [authenticatedGuard], clientController.getAccount);
router.get('/payments', [authenticatedGuard], clientController.getPayments);
router.get(
  '/payments/complete',
  [authenticatedGuard, validateDto(CompletePaymentDto, 'query')],
  clientController.getCompletePayments
);
router.get(
  '/payments/cancel',
  [authenticatedGuard],
  clientController.getCancelPayments
);
router.get(
  '/payments/funds/add',
  [authenticatedGuard],
  clientController.getAddFunds
);
router.get('/settings', [authenticatedGuard], clientController.getSettings);
router.get('/my-cars', [authenticatedGuard], clientController.getMyCars);
router.get(
  '/cars/register',
  [authenticatedGuard],
  clientController.getRegisterCar
);
router.post(
  '/cars/delete/:id',
  [authenticatedGuard],
  clientController.postDeleteCar
);

// Post methods
router.post(
  '/account',
  [authenticatedGuard, validateDto(UpdateAccountDto, 'body')],
  clientController.postAccount
);
router.post(
  '/cars/register',
  [authenticatedGuard, validateDto(RegisterCarDto, 'body')],
  clientController.postRegisterCar
);
router.post(
  '/payments/funds/add',
  [authenticatedGuard, validateDto(AddFundsDto, 'body')],
  clientController.postAddFunds
);

export default router;
