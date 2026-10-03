import React, { useState, useMemo } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    SafeAreaView,
    Platform,
    KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
    CATEGORY_DEFINITIONS,
    CategoryDefinition,
} from '../constants/categories';

interface CategoryPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectCategory: (categoryName: string, subcategoryName?: string) => void;
    selectedCategory?: string;
    selectedSubcategory?: string;
    title?: string;
    subtitle?: string;
    allowSubcategories?: boolean;
}

export default function CategoryPickerModal({
    visible,
    onClose,
    onSelectCategory,
    selectedCategory = '',
    selectedSubcategory = '',
    title = 'Select Business Category',
    subtitle = 'Choose from verified industries & services',
    allowSubcategories = true,
}: CategoryPickerModalProps) {
    const { colors } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    // Filter categories and subcategories based on search query
    const filteredCategories = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return CATEGORY_DEFINITIONS;

        return CATEGORY_DEFINITIONS.filter((cat) => {
            const matchesCat = cat.name.toLowerCase().includes(query);
            const matchesSub = cat.subcategories.some((sub) =>
                sub.toLowerCase().includes(query)
            );
            return matchesCat || matchesSub;
        });
    }, [searchQuery]);

    const handleSelect = (categoryName: string, subName?: string) => {
        onSelectCategory(categoryName, subName);
        onClose();
    };

    const renderItem = ({ item }: { item: CategoryDefinition }) => {
        const isSelected = selectedCategory === item.name;
        const isExpanded = expandedCategory === item.id;
        const query = searchQuery.trim().toLowerCase();

        // Subcategories matching search query if active
        const matchingSubcategories = query
            ? item.subcategories.filter((s) => s.toLowerCase().includes(query))
            : item.subcategories;

        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}>
                <TouchableOpacity
                    style={styles.cardHeader}
                    activeOpacity={0.7}
                    onPress={() => {
                        if (allowSubcategories && item.subcategories.length > 0) {
                            setExpandedCategory(isExpanded ? null : item.id);
                        } else {
                            handleSelect(item.name);
                        }
                    }}
                >
                    <View style={[styles.iconContainer, { backgroundColor: isSelected ? `${colors.primary}25` : `${colors.border}40` }]}>
                        <Ionicons
                            name={(item.icon || 'pricetag-outline') as any}
                            size={22}
                            color={isSelected ? colors.primary : colors.textSecondary}
                        />
                    </View>

                    <View style={styles.cardInfo}>
                        <Text style={[styles.categoryTitle, { color: isSelected ? colors.primary : colors.textPrimary }]}>
                            {item.name}
                        </Text>
                        <Text style={[styles.subCountText, { color: colors.textSecondary }]}>
                            {item.subcategories.length} specializations available
                        </Text>
                    </View>

                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={[styles.selectMainBtn, { backgroundColor: isSelected ? colors.primary : `${colors.primary}15` }]}
                            onPress={() => handleSelect(item.name)}
                        >
                            <Text style={[styles.selectMainText, { color: isSelected ? '#FFFFFF' : colors.primary }]}>
                                {isSelected ? 'Selected' : 'Pick'}
                            </Text>
                        </TouchableOpacity>

                        {allowSubcategories && item.subcategories.length > 0 && (
                            <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={colors.textSecondary}
                                style={{ marginLeft: 8 }}
                            />
                        )}
                    </View>
                </TouchableOpacity>

                {/* Subcategories dropdown */}
                {allowSubcategories && (isExpanded || query.length > 0) && (
                    <View style={[styles.subcategoriesContainer, { borderTopColor: colors.border }]}>
                        <Text style={[styles.subHeaderLabel, { color: colors.textSecondary }]}>
                            Popular roles in {item.name}:
                        </Text>
                        <View style={styles.chipWrapper}>
                            {matchingSubcategories.map((sub, idx) => {
                                const isSubSelected = selectedSubcategory === sub || (isSelected && selectedCategory === sub);
                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[
                                            styles.subChip,
                                            {
                                                backgroundColor: isSubSelected ? colors.primary : `${colors.surface}99`,
                                                borderColor: isSubSelected ? colors.primary : colors.border,
                                            },
                                        ]}
                                        onPress={() => handleSelect(item.name, sub)}
                                    >
                                        <Text
                                            style={[
                                                styles.subChipText,
                                                { color: isSubSelected ? '#FFFFFF' : colors.textPrimary },
                                            ]}
                                        >
                                            {sub}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalOverlay}
            >
                <SafeAreaView style={[styles.modalContent, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>
                            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                                {subtitle}
                            </Text>
                        </View>
                        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.surface }]} onPress={onClose}>
                            <Ionicons name="close" size={20} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.textPrimary }]}
                            placeholder="Search category, service, trade, or skill..."
                            placeholderTextColor={colors.textSecondary}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCorrect={false}
                            clearButtonMode="while-editing"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Category List */}
                    <FlatList
                        data={filteredCategories}
                        keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        initialNumToRender={15}
                        maxToRenderPerBatch={20}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="search-outline" size={48} color={colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    No category found matching "{searchQuery}"
                                </Text>
                            </View>
                        }
                    />
                </SafeAreaView>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        height: '90%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalSubtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginVertical: 12,
        paddingHorizontal: 14,
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 30,
    },
    card: {
        borderRadius: 14,
        borderWidth: 1,
        marginBottom: 10,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
    },
    iconContainer: {
        width: 42,
        height: 42,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    cardInfo: {
        flex: 1,
    },
    categoryTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    subCountText: {
        fontSize: 11,
        marginTop: 2,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    selectMainBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    selectMainText: {
        fontSize: 12,
        fontWeight: '700',
    },
    subcategoriesContainer: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        paddingTop: 10,
        borderTopWidth: 1,
    },
    subHeaderLabel: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    chipWrapper: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    subChip: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
        borderWidth: 1,
    },
    subChipText: {
        fontSize: 12,
        fontWeight: '500',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 14,
        marginTop: 12,
        textAlign: 'center',
    },
});
