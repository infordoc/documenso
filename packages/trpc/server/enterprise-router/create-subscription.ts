import { createCheckoutSession } from '@documenso/ee/server-only/stripe/create-checkout-session';
import { createCustomer } from '@documenso/ee/server-only/stripe/create-customer';
import { IS_BILLING_ENABLED, NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { stripe } from '@documenso/lib/server-only/stripe';
import { buildOrganisationWhereQuery } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZCreateSubscriptionRequestSchema } from './create-subscription.types';

export const createSubscriptionRoute = authenticatedProcedure
  .input(ZCreateSubscriptionRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const { organisationId, priceId, isPersonalLayoutMode } = input;

    ctx.logger.info({
      input: {
        organisationId,
        priceId,
      },
    });

    const userId = ctx.user.id;

    if (!IS_BILLING_ENABLED()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Billing is not enabled',
      });
    }

    const organisation = await prisma.organisation.findFirst({
      where: buildOrganisationWhereQuery({
        organisationId,
        userId,
        roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_BILLING'],
      }),
      include: {
        subscription: true,
        owner: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }

    // Se já existe uma subscription ativa, atualizar o plano diretamente
    if (organisation.subscription?.planId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(organisation.subscription.planId);

        if (!subscription) {
          throw new AppError(AppErrorCode.NOT_FOUND, {
            message: 'Subscription not found in Stripe',
          });
        }

        const currentItem = subscription.items.data[0];

        if (!currentItem) {
          throw new AppError(AppErrorCode.INVALID_REQUEST, {
            message: 'Subscription has no items',
          });
        }

        // Atualizar a subscription com o novo preço
        await stripe.subscriptions.update(organisation.subscription.planId, {
          items: [
            {
              id: currentItem.id,
              price: priceId,
            },
          ],
          proration_behavior: 'always_invoice',
        });

        const returnUrl = isPersonalLayoutMode
          ? `${NEXT_PUBLIC_WEBAPP_URL()}/settings/billing-personal?updated=true`
          : `${NEXT_PUBLIC_WEBAPP_URL()}/o/${organisation.url}/settings/billing?updated=true`;

        return {
          redirectUrl: returnUrl,
        };
      } catch (error) {
        ctx.logger.error({ error }, 'Failed to update subscription');

        throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
          message: 'Failed to update subscription plan',
        });
      }
    }

    let customerId = organisation.customerId;

    if (!customerId) {
      const customer = await createCustomer({
        name: organisation.owner.name || organisation.owner.email,
        email: organisation.owner.email,
      });

      customerId = customer.id;

      await prisma.organisation.update({
        where: {
          id: organisationId,
        },
        data: {
          customerId: customer.id,
        },
      });
    }

    const returnUrl = isPersonalLayoutMode
      ? `${NEXT_PUBLIC_WEBAPP_URL()}/settings/billing-personal`
      : `${NEXT_PUBLIC_WEBAPP_URL()}/o/${organisation.url}/settings/billing`;

    const redirectUrl = await createCheckoutSession({
      customerId,
      priceId,
      returnUrl,
    });

    if (!redirectUrl) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Failed to create checkout session',
      });
    }

    return {
      redirectUrl,
    };
  });
