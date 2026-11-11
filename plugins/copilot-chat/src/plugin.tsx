import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import ChatIcon from '@material-ui/icons/Chat';

import { rootRouteRef } from './routes';

export const page = PageBlueprint.make({
  params: {
    path: '/copilot-chat',
    routeRef: rootRouteRef,
    title: 'Copilot Chat',
    icon: <ChatIcon />,
    noHeader: true,
    loader: () =>
      import('./components/CopilotChatPage').then(m => <m.CopilotChatPage />),
  },
});

export const copilotChatPlugin = createFrontendPlugin({
  pluginId: 'copilot-chat',
  extensions: [page],
  routes: {
    root: rootRouteRef,
  },
});
