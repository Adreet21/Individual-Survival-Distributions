export interface DragItem {
  id: string;
  type: 'predictor' | 'dataset';
  title: string;
  owner: boolean;
  folderId?: string;
}
