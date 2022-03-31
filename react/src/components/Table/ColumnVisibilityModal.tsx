import { useState } from 'react';
import { DragDropContext, Draggable, Droppable, DropResult } from 'react-beautiful-dnd';
import { BsFillEyeFill, BsFillEyeSlashFill } from 'react-icons/bs';
import { MdDragHandle } from 'react-icons/md';
import { ColumnInstance, HeaderGroup, UseTableInstanceProps } from 'react-table';
import { camelize } from '../../utils';
import { Button, Checkbox, Flex, InlineFlex, Modal } from '../index';
import { IconPadder } from './Table.styles';

interface ColumnVisibilityModalProps<T extends object>
    extends Pick<UseTableInstanceProps<T>, 'toggleHideColumn'> {
    headerGroups: HeaderGroup<T>[];
    toggleGroupVisibility: (g: HeaderGroup<T>) => void;
    allColumns: ColumnInstance<T>[];
    setColumnOrder: (update: string[] | ((columnOrder: string[]) => string[])) => void;
}

export default function ColumnVisibilityModal<T extends {}>({
    headerGroups,
    toggleGroupVisibility,
    toggleHideColumn,
    allColumns,
    setColumnOrder,
}: ColumnVisibilityModalProps<T>) {
    const [showModal, setShowModal] = useState<boolean>(false);
    const [order, setOrder] = useState<ColumnInstance<T>[]>([]);
    const reorder = (startIndex: number, endIndex: number): ColumnInstance<T>[] => {
        const result: ColumnInstance<T>[] = order;
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };
    const onDragEnd = (result: DropResult) => {
        const { source, destination } = result;
        if (!destination) {
            return;
        }
        console.log(source.index, destination.index);
        const columnOrder = reorder(source.index, destination.index);
        setOrder(columnOrder);
    };

    return (
        <InlineFlex>
            <Button
                variant="secondary"
                onClick={() => {
                    setShowModal(!showModal);
                    setOrder(allColumns);
                }}
            >
                Customize columns
                <IconPadder>{showModal ? <BsFillEyeFill /> : <BsFillEyeSlashFill />}</IconPadder>
            </Button>
            <Modal
                active={showModal}
                hideModal={() => setShowModal(false)}
                title="Customize Columns"
                footer="Reorder"
                onClick={() => {
                    setColumnOrder(order.map(o => o.id));
                    setShowModal(false);
                }}
            >
                {headerGroups[0].headers.map((g, id) => (
                    <DragDropContext key={id} onDragEnd={onDragEnd}>
                        <Droppable key={id} droppableId={JSON.stringify(id)}>
                            {(droppableProvided, snapshot) => (
                                <div
                                    ref={droppableProvided.innerRef}
                                    {...droppableProvided.droppableProps}
                                >
                                    <Checkbox
                                        label={g.Header as string}
                                        checked={g.isVisible}
                                        onClick={() => toggleGroupVisibility(g)}
                                    />
                                    {order.map(
                                        (c, id) =>
                                            g.columns?.find(column => column.id === c.id) &&
                                            c.type !== 'fixed' &&
                                            c.type !== 'empty' && (
                                                <Draggable
                                                    key={c.id}
                                                    draggableId={c.id}
                                                    index={id}
                                                    isDragDisabled={c.isVisible ? false : true}
                                                >
                                                    {(provided, snapshot) => (
                                                        <Flex
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            justifyContent="space-between"
                                                            alignItems="center"
                                                            fullWidth={true}
                                                        >
                                                            <div style={{ paddingLeft: 20 }}>
                                                                <Checkbox
                                                                    label={c.Header as string}
                                                                    checked={c.isVisible}
                                                                    onClick={() => {
                                                                        if (
                                                                            c.parent &&
                                                                            g.columns?.filter(
                                                                                c => c.isVisible
                                                                            ).length === 1
                                                                        ) {
                                                                            toggleHideColumn(
                                                                                c.id,
                                                                                c.isVisible
                                                                            );
                                                                            toggleHideColumn(
                                                                                camelize(
                                                                                    `empty ${c.parent.id}`
                                                                                ),
                                                                                !c.isVisible
                                                                            );
                                                                        } else {
                                                                            toggleHideColumn(
                                                                                c.id,
                                                                                c.isVisible
                                                                            );
                                                                        }
                                                                    }}
                                                                />
                                                            </div>

                                                            {c.isVisible && (
                                                                <div
                                                                    {...provided.dragHandleProps}
                                                                    style={{
                                                                        justifyContent: 'flex-end',
                                                                        display: 'flex',
                                                                        paddingRight: '40px',
                                                                    }}
                                                                >
                                                                    <MdDragHandle />
                                                                </div>
                                                            )}
                                                        </Flex>
                                                    )}
                                                </Draggable>
                                            )
                                    )}
                                    {droppableProvided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                ))}
            </Modal>
        </InlineFlex>
    );
}
