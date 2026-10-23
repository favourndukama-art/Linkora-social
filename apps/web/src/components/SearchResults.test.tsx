import { render, screen } from "@testing-library/react";
import { SearchResults } from "./SearchResults";

jest.mock("./PostCard", () => ({
  PostCard: ({ post }: { post: { id: string | number } }) => <div data-testid="post-card">{post.id}</div>,
  PostCardSkeleton: () => <div data-testid="post-skeleton" />,
}));

jest.mock("./ProfileCard", () => ({
  ProfileCard: ({ profile }: { profile: { address: string } }) => <div data-testid="profile-card">{profile.address}</div>,
}));

describe("SearchResults", () => {
  it("returns null when the query is empty", () => {
    const { container } = render(<SearchResults tab="posts" query="  " />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an empty state when a query has no results", () => {
    render(<SearchResults tab="posts" query="missing" />);
    expect(screen.getByText('No posts found for “missing”.')).toBeInTheDocument();
  });

  it("renders one card per result and links to each result", () => {
    render(
      <SearchResults
        tab="posts"
        query="hello"
        posts={[
          { id: "post-1", author: "alice", content: "hello one" },
          { id: "post-2", author: "bob", content: "hello two" },
        ]}
      />
    );

    expect(screen.getAllByTestId("post-card")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View post by alice" })).toHaveAttribute("href", "/posts/post-1");
    expect(screen.getByRole("link", { name: "View post by bob" })).toHaveAttribute("href", "/posts/post-2");
  });

  it("shows loading skeletons while post results are loading", () => {
    render(<SearchResults tab="posts" query="hello" loading />);
    expect(screen.getAllByTestId("post-skeleton")).toHaveLength(5);
  });

  it("links profile results to their profile pages", () => {
    render(
      <SearchResults
        tab="profiles"
        query="alice"
        profiles={[{ address: "GABC", username: "alice" }]}
      />
    );

    expect(screen.getByTestId("profile-card")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile alice" })).toHaveAttribute("href", "/profile/GABC");
  });
});
