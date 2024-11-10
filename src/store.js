import { createReduxStore, register, combineReducers } from '@wordpress/data';
import { serialize } from '@wordpress/blocks';
import { store as noticesStore } from '@wordpress/notices';

const EMPTY_ARRAY = [];
const postObject = {
	id: 1,
	title: '',
	content: '',
	status: 'draft',
	_links: {
		'wp:action-publish': true,
	},
};
const postTypeObject = {
	labels: {},
	supports: {},
};

const newStore = createReduxStore('core', {
	reducer: combineReducers({
		post: (state = postObject, action) => {
			switch (action.type) {
				case 'EDIT_ENTITY_RECORD':
					return { ...state, ...action.attributes };
			}
			return state;
		},
		fileHandle: (state = null, action) => {
			switch (action.type) {
				case 'SET_FILE_HANDLE':
					return action.fileHandle;
			}
			return state;
		},
		saving: (state = {}, action) => {
			switch (action.type) {
				case 'SAVE_ENTITY_RECORD_START':
				case 'SAVE_ENTITY_RECORD_FINISH':
					return {
						...state,
						[action.recordId]: {
							pending: action.type === 'SAVE_ENTITY_RECORD_START',
							error: action.error,
							isAutosave: action.isAutosave,
						},
					};
			}

			return state;
		},
	}),
	selectors: {
		getEntityRecord: (state) => {
			return state.post;
		},
		getEntityRecords: () => {
			return EMPTY_ARRAY;
		},
		getEntityRecordEdits: (state) => {
			return state.post;
		},
		getRawEntityRecord: (state) => {
			return state.post;
		},
		getEditedEntityRecord: (state) => {
			return state.post;
		},
		canUser: () => {
			return true;
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
		hasUndo: () => {},
		hasRedo: () => {},
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
		getEntityRecordNonTransientEdits: (state) => {
			return state.post;
		},
		getLastEntitySaveError: () => {
			return null;
		},
		getFileHandle: (state) => {
			return state.fileHandle;
		},
	},
	actions: {
		editEntityRecord: (kind, type, id, attributes) => {
			return {
				type: 'EDIT_ENTITY_RECORD',
				attributes,
			};
		},
		saveEntityRecord:
			() =>
			async ({ select, registry }) => {
				const post = select.getEditedEntityRecord();
				if (!post.blocks) {
					return;
				}
				const content = serialize(post.blocks);
				const fileHandle = select.getFileHandle();
				const writableStream = await fileHandle.createWritable();
				await writableStream.write(content);
				await writableStream.close();
				registry
					.dispatch(noticesStore)
					.createSuccessNotice('Item updated');
			},
		__unstableCreateUndoLevel: () => {
			return { type: 'CREATE_UNDO_LEVEL' };
		},
		setFile:
			(fileHandle) =>
			async ({ dispatch }) => {
				const file = await fileHandle.getFile();
				const text = await file.text();
				await dispatch({
					type: 'EDIT_ENTITY_RECORD',
					attributes: { content: text, title: fileHandle.name },
				});
				await dispatch({
					type: 'SET_FILE_HANDLE',
					fileHandle,
				});
			},
	},
	resolvers: {},
});
register(newStore);
