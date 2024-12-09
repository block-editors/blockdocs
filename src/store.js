import { createReduxStore, register, combineReducers } from '@wordpress/data';
import { serialize, parse, createBlock } from '@wordpress/blocks';
import { store as noticesStore } from '@wordpress/notices';
import { createUndoManager } from '@wordpress/undo-manager';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';

import { EPUB_MIME_TYPE, OPF_FILE, createEPub } from './epub';
import { downloadFile } from './file';

const EMPTY_ARRAY = [];
const defaultAttributes = {
	status: 'draft',
	_links: { 'wp:action-publish': true },
};
const postObject = {
	id: uuidv4(),
	title: 'Untitled Document',
	content: `<!-- wp:paragraph -->
<p></p>
<!-- /wp:paragraph -->`,
	coverConfig: {
		color: '#000000',
		backgroundColor: '#ffffff',
		fontSize: 160,
		fontFamily: '',
		paddingLeft: 10,
		paddingRight: 10,
		verticalOffset: 0,
	},
	...defaultAttributes,
};
const postTypeObject = {
	labels: {},
	supports: {},
};

async function extractImages(blocks) {
	const images = new Map();
	const newBlocks = await Promise.all(
		blocks.map(async (block) => {
			const { innerBlocks = [], attributes, name } = block;
			const [newInnerBlocks, moreImages] = await extractImages(
				innerBlocks,
				images
			);
			for (const image of moreImages) {
				images.set(image.id, image);
			}
			if (name === 'core/image' && attributes.url) {
				const relPath = attributes.url.split('#').pop();
				images.set(
					relPath,
					await fetch(attributes.url).then((r) => r.blob())
				);
				return {
					...block,
					innerBlocks: newInnerBlocks,
					attributes: {
						...attributes,
						url: relPath,
						id: undefined,
					},
				};
			}
			return {
				...block,
				innerBlocks: newInnerBlocks,
			};
		})
	);
	return [newBlocks, images];
}

const newStore = createReduxStore('core', {
	reducer: combineReducers({
		currentPostId: (state = postObject.id, action) => {
			return action.type === 'SET_CURRENT_POST_ID'
				? action.postId
				: state;
		},
		posts: (state = { [postObject.id]: postObject }, action) => {
			switch (action.type) {
				case 'EDIT_ENTITY_RECORD':
					return {
						...state,
						[action.recordId]: {
							id: action.recordId,
							...defaultAttributes,
							...state[action.recordId],
							...action.attributes,
							coverConfig: state[action.recordId]
								? {
										...state[action.recordId].coverConfig,
										...action.attributes.coverConfig,
								  }
								: action.attributes.coverConfig,
						},
					};
				case 'UNDO': {
					return {
						...state,
						...action.record.reduce((posts, { id, changes }) => {
							posts[id] = {
								...state[id],
								...Object.keys(changes).reduce((acc, key) => {
									acc[key] = changes[key].from;
									return acc;
								}, {}),
							};
							return posts;
						}, {}),
					};
				}
				case 'REDO': {
					return {
						...state,
						...action.record.reduce((posts, { id, changes }) => {
							posts[id] = {
								...state[id],
								...Object.keys(changes).reduce((acc, key) => {
									acc[key] = changes[key].to;
									return acc;
								}, {}),
							};
							return posts;
						}, {}),
					};
				}
			}
			return state;
		},
		fileHandle: (state = {}, { type, fileHandle, id }) => {
			return type === 'SET_FILE_HANDLE'
				? { ...state, [id]: fileHandle }
				: state;
		},
		undoManager: (state = createUndoManager(), { type }) => {
			return type === 'CLEAR_UNDO_MANAGER' ? createUndoManager() : state;
		},
	}),
	selectors: {
		getCurrentPostId: (state) => {
			return state.currentPostId;
		},
		getEntityRecord: (state, kind, type, id) => {
			return state.posts[id];
		},
		getEntityRecords: () => {
			return EMPTY_ARRAY;
		},
		getEntityRecordEdits: (state, kind, type, id) => {
			return state.posts[id];
		},
		getRawEntityRecord: (state, kind, type, id) => {
			return state.posts[id];
		},
		getEditedEntityRecord: (state, kind, type, id) => {
			return state.posts[id];
		},
		canUser: (state, action) => {
			return ['read', 'update', 'create'].includes(action);
		},
		getUserPatternCategories: () => {
			return EMPTY_ARRAY;
		},
		getBlockPatternCategories: () => {
			return EMPTY_ARRAY;
		},
		__experimentalGetCurrentGlobalStylesId: () => {},
		__experimentalGetCurrentThemeBaseGlobalStyles: () => {},
		getPostType: () => {
			return postTypeObject;
		},
		hasUndo: (state) => {
			return state.undoManager.hasUndo();
		},
		hasRedo: (state) => {
			return state.undoManager.hasRedo();
		},
		hasEditsForEntityRecord: () => {},
		getCurrentUser: () => {},
		getAutosave: () => {},
		__experimentalGetDirtyEntityRecords: () => {
			return EMPTY_ARRAY;
		},
		__experimentalGetEntitiesBeingSaved: () => {
			return EMPTY_ARRAY;
		},
		getEntityRecordPermissions: () => {},
		getThemeSupports: () => {},
		getUsers: () => {
			return EMPTY_ARRAY;
		},
		getTaxonomies: () => {
			return EMPTY_ARRAY;
		},
		getCurrentTheme: () => {},
		getBlockPatternsForPostType: () => {
			return EMPTY_ARRAY;
		},
		getEntityRecordNonTransientEdits: (state, kind, type, id) => {
			return state.posts[id];
		},
		getLastEntitySaveError: () => {
			return null;
		},
		getMedia: () => {},
		getFileHandle: (state, id) => {
			return state.fileHandle[id];
		},
		getUndoManager: (state) => {
			return state.undoManager;
		},
		hasFinishedResolution: (state, kind, type, id) => {
			return true;
		},
	},
	actions: {
		undo:
			() =>
			async ({ select, dispatch }) => {
				const undoRecord = select.getUndoManager().undo();
				if (!undoRecord) {
					return;
				}
				await dispatch({ type: 'UNDO', record: undoRecord });
			},
		redo:
			() =>
			async ({ select, dispatch }) => {
				const redoRecord = select.getUndoManager().redo();
				if (!redoRecord) {
					return;
				}
				await dispatch({ type: 'REDO', record: redoRecord });
			},
		editEntityRecord:
			(kind, type, id, attributes, options = {}) =>
			async ({ select, dispatch }) => {
				if (!options.undoIgnore) {
					const state = select.getEditedEntityRecord(kind, type, id);
					select.getUndoManager().addRecord(
						[
							{
								id,
								changes: Object.keys(attributes).reduce(
									(acc, key) => {
										acc[key] = {
											from: state[key],
											to: attributes[key],
										};
										return acc;
									},
									{}
								),
							},
						],
						options.isCached
					);
					// if (attributes.blocks) {
					// 	const [blocks] = await extractImages(attributes.blocks);
					// 	const local = serialize(blocks);
					// 	window.localStorage.setItem(id, local);
					// 	window.localStorage.setItem(id + '-time', Date.now());
					// }
				}
				await dispatch({
					type: 'EDIT_ENTITY_RECORD',
					attributes,
					recordId: id,
				});
			},
		saveEntityRecord:
			(kind, type, id) =>
			async ({ select, dispatch, registry }) => {
				try {
					const post = select.getEditedEntityRecord(kind, type, id);
					const [blocks, images] = await extractImages(post.blocks??[]);
					const chapters = blocks.filter(
						(block) =>
							block.name === 'core/heading' &&
							block.attributes.content
					);
					// Add chapter IDs to the blocks
					chapters.forEach((block) => {
						block.attributes.anchor = block.attributes.content
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, '-');
					});
					const content = serialize(blocks);
					const blob = await createEPub({
						title: post.title,
						uniqueId: id,
						content,
						language: 'en',
						assets: images,
						nav: chapters.map((chapter) => ({
							title: chapter.attributes.content,
							level: chapter.attributes.level,
							href: `#${chapter.attributes.anchor}`,
						})),
						coverConfig: post.coverConfig,
					});

					let fileHandle = select.getFileHandle(id);

					if (!fileHandle) {
						if (!window.showSaveFilePicker) {
							downloadFile(blob, `${post.title}.epub`);
							registry
								.dispatch(noticesStore)
								.createSuccessNotice(
									'Item downloaded. Please use Chrome to write to an existing file.',
									{ id: 'save-notice' }
								);
							return;
						}
						const options = {
							types: [
								{
									description:
										'A file to store your document.',
									accept: { [EPUB_MIME_TYPE]: ['.epub'] },
								},
							],
							suggestedName: `${post.title}.epub`,
						};
						fileHandle = await window.showSaveFilePicker(options);
						if ( /[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/u.test(fileHandle.name)) {
							registry
								.dispatch(noticesStore)
								.createWarningNotice('Make sure to remove emoji from the file name when sending to Kindle.', {
										id: 'emoji-notice',
									});
						}
						// await dispatch({
						// 	type: 'EDIT_ENTITY_RECORD',
						// 	recordId: id,
						// 	attributes: { title: fileHandle.name },
						// });
						await dispatch({
							type: 'SET_FILE_HANDLE',
							fileHandle,
							id,
						});
					}
					const writableStream = await fileHandle.createWritable();

					await writableStream.write(blob);
					await writableStream.close();
					registry
						.dispatch(noticesStore)
						.createSuccessNotice('Item updated', {
							id: 'save-notice',
						});
				} catch (e) {
					window.console.error(e);
				}
			},
		__unstableCreateUndoLevel:
			() =>
			({ select }) => {
				select.getUndoManager().addRecord();
			},
		setFile:
			(fileHandle) =>
			async ({ dispatch, registry }) => {
				let file = fileHandle;
				if (fileHandle.getFile) {
					file = await fileHandle.getFile();
				}
				const { lastModified } = file;
				const zip = await JSZip.loadAsync(file);
				const index = zip.file('index.html');

				if (!index) {
					// eslint-disable-next-line no-alert
					window.alert('This file was not created with this app.');
					return;
				}

				const opf = zip.file(OPF_FILE);

				if (!opf) {
					// eslint-disable-next-line no-alert
					window.alert('No meta data found.');
					return;
				}

				const parser = new window.DOMParser();
				const xmlDoc = parser.parseFromString(
					await opf.async('string'),
					'text/xml'
				);

				const packageEl = xmlDoc.querySelector('package');

				const idAttrName = packageEl.getAttribute('unique-identifier');
				let id = xmlDoc.getElementById(idAttrName)?.textContent;
				if (! id || id === 'unique-id') {
					id = uuidv4();
				}
				const titleElement = Array.from(
					xmlDoc.querySelector('metadata').children
				).find((el) => el.prefix === 'dc' && el.localName === 'title');
				const title = titleElement.textContent;

				const text = await index.async('string');

				async function addImages(string) {
					const doc = parser.parseFromString(string, 'text/html');
					for (const img of doc.querySelectorAll('img')) {
						const src = img.getAttribute('src');
						if (!src) {
							continue;
						}
						img.src =
							URL.createObjectURL(
								await zip.file(src).async('blob')
							) +
							'#' +
							src;
					}
					return parse(doc.body.innerHTML);
				}

				const blocks = await addImages(text) ?? [];
				const coverJson = zip.file('cover.json');

				if ( blocks.length === 0 ) {
					blocks.push( createBlock('core/paragraph'));
				}

				await dispatch({
					type: 'EDIT_ENTITY_RECORD',
					recordId: id,
					attributes: {
						blocks,
						content: serialize(blocks),
						title,
						coverConfig: coverJson
							? JSON.parse(await coverJson.async('string'))
							: postObject.coverConfig,
					},
				});
				dispatch({ type: 'CLEAR_UNDO_MANAGER' });
				dispatch({ type: 'SET_CURRENT_POST_ID', postId: id });
				if (fileHandle?.getFile) {
					await dispatch({ type: 'SET_FILE_HANDLE', fileHandle, id });
				}

				// Check if local storage has the same content
				const local = window.localStorage.getItem(id);
				const localTime = window.localStorage.getItem(id + '-time');
				if (local && localTime && lastModified < localTime) {
					const _blocks = await addImages(`<body>${local}</body>`);
					await dispatch.editEntityRecord(null, null, id, {
						blocks: _blocks,
						content: serialize(_blocks),
					});
					registry
						.dispatch(noticesStore)
						.createWarningNotice(
							'Recovered unsaved changes. Press Undo to revert.',
							{ id: 'local-save' }
						);
				}
			},
	},
	resolvers: {},
});
register(newStore);
