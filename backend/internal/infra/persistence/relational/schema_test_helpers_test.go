package relational

import "testing"

// assertSQLiteIndexes / assertSQLiteMissingIndexes 用于校验 SQLite 迁移后的索引状态。
// 索引是 schema 演进最容易回归的部分：重命名列、重建表、升级约束都可能悄悄丢掉索引，
// 而丢失索引只会在数据量大时才表现为性能问题，因此需要显式断言。
func assertSQLiteIndexes(t *testing.T, database *Database, table string, expected ...string) {
	t.Helper()
	var indexes []struct {
		Name   string
		Unique int
	}
	if err := database.db.Raw("PRAGMA index_list('" + table + "')").Scan(&indexes).Error; err != nil {
		t.Fatal(err)
	}
	found := make(map[string]bool, len(indexes))
	for _, index := range indexes {
		found[index.Name] = true
	}
	for _, name := range expected {
		if !found[name] {
			t.Fatalf("table %s missing index %s: %#v", table, name, indexes)
		}
	}
}

func assertSQLiteMissingIndexes(t *testing.T, database *Database, table string, unexpected ...string) {
	t.Helper()
	var indexes []struct {
		Name   string
		Unique int
	}
	if err := database.db.Raw("PRAGMA index_list('" + table + "')").Scan(&indexes).Error; err != nil {
		t.Fatal(err)
	}
	found := make(map[string]bool, len(indexes))
	for _, index := range indexes {
		found[index.Name] = true
	}
	for _, name := range unexpected {
		if found[name] {
			t.Fatalf("table %s still has index %s: %#v", table, name, indexes)
		}
	}
}
