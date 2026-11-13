import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import {
  githubAuthApiRef,
  microsoftAuthApiRef,
} from '@backstage/core-plugin-api';

const githubProvider = {
  id: 'github-auth-provider',
  title: 'GitHub',
  message: 'Sign in using GitHub (required for the Copilot chat)',
  apiRef: githubAuthApiRef,
};

const microsoftProvider = {
  id: 'microsoft-auth-provider',
  title: 'Microsoft Entra ID',
  message: 'Inicia sesión con tu cuenta corporativa',
  apiRef: microsoftAuthApiRef,
};

export const signInModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        loader: async () => props =>
          (
            <SignInPage
              {...props}
              providers={['guest', microsoftProvider, githubProvider]}
            />
          ),
      },
    }),
  ],
});
