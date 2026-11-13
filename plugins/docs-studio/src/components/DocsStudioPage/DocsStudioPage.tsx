/*
 * Copyright 2026 The Docs Studio Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Route, Routes } from 'react-router-dom';
import { Header, Page } from '@backstage/core-components';
import { strings } from '../../strings';
import { EditPage } from '../EditPage/EditPage';
import { NewPage } from '../NewPage/NewPage';
import { ProposalDetailPage } from '../ProposalDetail/ProposalDetailPage';
import { ProposalListPage } from '../ProposalList/ProposalListPage';

/** Single routable page hosting the list, detail, edit and create views. */
export function DocsStudioPage() {
  return (
    <Page themeId="documentation">
      <Header title={strings.list.title} subtitle={strings.list.subtitle} />
      <Routes>
        <Route index element={<ProposalListPage />} />
        <Route path="proposals/:id" element={<ProposalDetailPage />} />
        <Route path="edit" element={<EditPage />} />
        <Route path="new" element={<NewPage />} />
      </Routes>
    </Page>
  );
}
