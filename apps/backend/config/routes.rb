Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "s/:code" => "short_links#show", constraints: { code: /[A-Za-z0-9]{7}/ }

  namespace :api do
    namespace :v1 do
      resources :sessions, only: :create
      resource :device, only: :update
      resources :peers, only: :index
      resources :short_links, only: [ :index, :create, :show ]
      resources :transfers, only: [ :index, :create, :show ] do
        post :complete, on: :member
      end
      resources :local_blobs, only: [ :show, :update ], param: :key, constraints: { key: /.*/ }
    end
  end

  namespace :internal do
    post :expire, to: "expire#create"
  end
end
