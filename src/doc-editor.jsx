import React, { useState, useEffect } from 'react';
import { privateApis } from '@wordpress/editor';
import { unlock } from './lock-unlock';
import { useDispatch } from '@wordpress/data';
// import { CommandMenu } from '@wordpress/commands';

const { Editor, FullscreenMode } = unlock(privateApis);

import './block-types/auto-generated.js';

import '@wordpress/format-library';

import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/editor/build-style/style.css';
import '@wordpress/commands/build-style/style.css';

import blockEditorContentStyle from '@wordpress/block-editor/build-style/content.css?raw';
import blockLibraryCommonStyle from '@wordpress/block-library/build-style/common.css?raw';
// eslint-disable-next-line import/no-unresolved
import blockLibraryContentStyle from './block-types/auto-generated-content.css?raw';
import componentsStyle from '@wordpress/components/build-style/style.css?raw';

// eslint-disable-next-line import/no-unresolved
import contentStyle from './content.css?raw';

// eslint-disable-next-line import/no-unresolved
import light from './light.css?raw';

const contentStyles = [
	componentsStyle,
	blockLibraryContentStyle,
	blockLibraryCommonStyle,
	blockEditorContentStyle,
	light,
	contentStyle,
];

function DocEditor() {
	const { setFile } = useDispatch('core');
	useEffect(() => {
		document.addEventListener('click', async (event) => {
			if (event.target.closest('.editor-document-bar__command')) {
				const [fileHandle] = await window.showOpenFilePicker({
					types: [
						{
							description: 'HTML files',
							accept: { 'text/html': ['.html'] },
						},
					],
				});
				setFile(fileHandle);
			}
		});
	}, []);
	return (
		<>
			<FullscreenMode isActive={true} />
			{/* <CommandMenu /> */}
			<Editor
				settings={ {
					__unstableResolvedAssets: {
						styles: contentStyles
							.map((css) => `<style>${css}</style>`)
							.join(''),
					},
				} }
			/>
		</>
	);
}

export default () => <DocEditor />;